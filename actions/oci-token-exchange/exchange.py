"""OCI token exchange: mints a GitHub OIDC ID token and writes OCI CLI auth."""

import datetime
import os
import sys
import time
from pathlib import Path

import oci
import oci.auth.signers
import requests
from cryptography.hazmat.primitives import serialization
from oci._vendor import requests as oci_requests

MAX_ATTEMPTS = 4
DELAYS = [0.5, 1.0, 2.0, 4.0]


def mask(value: str) -> None:
    """Register a value with GitHub Actions log masking."""
    print(f"::add-mask::{value}", flush=True)


def get_jwt(audience: str) -> str:
    """Mint a GitHub Actions OIDC ID token for the requested audience."""
    response = requests.get(
        os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"],
        params={"audience": audience},
        headers={
            "Authorization": f'bearer {os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]}'
        },
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["value"]


def exchange_with_retry(
    get_jwt_fn,
    domain_url: str,
    client_id: str,
    client_secret: str,
):
    """Create TokenExchangeSigner with bounded retry for transient OCI failures."""
    last_exc = None
    for attempt, delay in enumerate(DELAYS):
        try:
            return oci.auth.signers.TokenExchangeSigner(
                get_jwt_fn, domain_url, client_id, client_secret
            )
        except oci_requests.exceptions.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            if status < 500:
                body = exc.response.text if exc.response is not None else str(exc)
                print(f"::error::OCI token endpoint error {status}: {body}", flush=True)
                sys.exit(1)
            last_exc = exc
        except (oci_requests.exceptions.ConnectionError, OSError) as exc:
            last_exc = exc
        if attempt < len(DELAYS) - 1:
            time.sleep(delay)
    raise RuntimeError(
        f"OCI token exchange failed after {MAX_ATTEMPTS} attempts"
    ) from last_exc


def write_output(key: str, value: str) -> None:
    """Append a GitHub Actions output."""
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output_file:
        output_file.write(f"{key}={value}\n")


def write_env(key: str, value: str) -> None:
    """Append a GitHub Actions environment variable."""
    with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as env_file:
        env_file.write(f"{key}={value}\n")


def write_config(
    config_path: Path, token_path: Path, key_path: Path, region: str
) -> None:
    """Write OCI CLI config that points at the UPST token and private key."""
    config_path.write_text(
        "\n".join(
            [
                "[DEFAULT]",
                f"security_token_file={token_path.resolve()}",
                f"key_file={key_path.resolve()}",
                f"region={region}",
                "",
            ]
        ),
        encoding="utf-8",
    )


def write_credentials(
    signer,
    config_path: Path,
    key_path: Path,
    token_path: Path,
    region: str,
) -> str:
    """Persist UPST, private key, and OCI CLI config with owner-only permissions."""
    upst = signer.security_token_container.security_token
    private_key_obj = signer.session_key_supplier.private_key
    expires_epoch = signer.security_token_container.jwt["exp"]
    expires_at = datetime.datetime.fromtimestamp(
        expires_epoch, tz=datetime.timezone.utc
    ).isoformat()

    token_path.write_text(upst, encoding="utf-8")
    os.chmod(token_path, 0o600)

    private_pem = private_key_obj.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    key_path.write_bytes(private_pem)
    os.chmod(key_path, 0o600)

    write_config(config_path, token_path, key_path, region)
    os.chmod(config_path, 0o600)
    return expires_at


def required_env(name: str) -> str:
    """Read a required environment variable or fail with a GitHub Actions error."""
    value = os.environ.get(name)
    if not value:
        print(f"::error::Missing required environment variable {name}", flush=True)
        sys.exit(1)
    return value


def main() -> None:
    """Run one GitHub OIDC to OCI UPST exchange."""
    client_identifier = required_env("INPUT_CLIENT_IDENTIFIER")
    client_secret = required_env("INPUT_CLIENT_SECRET")
    domain_url = required_env("INPUT_DOMAIN_BASE_URL")
    audience = os.environ.get("INPUT_AUDIENCE", "https://github.com/ColourWithin")
    region = os.environ.get("INPUT_REGION", "ap-sydney-1")
    config_default = str(Path.home() / ".oci" / "config")
    key_default = str(Path.home() / ".oci" / "upst.pem")

    mask(client_secret)

    config_path = Path(
        os.environ.get("INPUT_OUTPUT_CONFIG_PATH", config_default)
    ).resolve()
    key_path = Path(os.environ.get("INPUT_OUTPUT_KEY_PATH", key_default)).resolve()
    token_path = config_path.parent / "upst.token"

    config_path.parent.mkdir(parents=True, exist_ok=True)
    key_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.parent.mkdir(parents=True, exist_ok=True)

    signer = exchange_with_retry(
        lambda: get_jwt(audience),
        domain_url,
        client_identifier,
        client_secret,
    )
    expires_at = write_credentials(signer, config_path, key_path, token_path, region)

    # requested_token_type: urn:oci:token-type:oci-upst - SDK handles this internally.
    upst = signer.security_token_container.security_token
    mask(upst.strip())
    write_output("config-path", str(config_path))
    write_output("expires-at", expires_at)
    write_env("OCI_CLI_AUTH", "security_token")


if __name__ == "__main__":
    main()
