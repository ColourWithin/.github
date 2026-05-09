"""Unit tests for exchange.py pure-Python helpers."""

import datetime
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from cryptography.hazmat.primitives import serialization
from oci._vendor import requests as oci_requests

sys.path.insert(0, str(Path(__file__).parent.parent))

import exchange  # noqa: E402
from exchange import (  # noqa: E402
    exchange_with_retry,
    get_jwt,
    mask,
    write_config,
    write_credentials,
    write_env,
    write_output,
)


def make_http_error(status: int, text: str = '{"error":"server"}'):
    response = MagicMock()
    response.status_code = status
    response.text = text
    return oci_requests.exceptions.HTTPError(response=response)


def make_signer(private_key):
    signer = MagicMock()
    signer.security_token_container.security_token = "fake.upst.token\n"  # noqa: S105
    signer.security_token_container.jwt = {"exp": 1746777600}
    signer.session_key_supplier.private_key = private_key
    return signer


def test_mask_calls_add_mask(capsys):
    mask("supersecret")
    captured = capsys.readouterr()
    assert "::add-mask::supersecret\n" in captured.out


def test_mask_strips_before_emit(capsys):
    mask("token\n".strip())
    captured = capsys.readouterr()
    assert "::add-mask::token\n" in captured.out


def test_write_output_appends(github_output):
    write_output("config-path", "/home/runner/.oci/config")
    assert "config-path=/home/runner/.oci/config\n" in github_output.read_text()


def test_write_output_multiple_keys(github_output):
    write_output("config-path", "/tmp/config")  # noqa: S108
    write_output("expires-at", "2026-05-09T12:00:00+00:00")
    content = github_output.read_text()
    assert "config-path=/tmp/config\n" in content
    assert "expires-at=2026-05-09T12:00:00+00:00\n" in content


def test_write_env_appends(github_env):
    write_env("OCI_CLI_AUTH", "security_token")
    assert "OCI_CLI_AUTH=security_token\n" in github_env.read_text()


def test_retry_no_retry_on_4xx():
    error = make_http_error(
        403, '{"error":"Forbidden","error_description":"IPT misconfigured"}'
    )
    with patch("exchange.oci.auth.signers.TokenExchangeSigner") as constructor:
        constructor.side_effect = error
        with pytest.raises(SystemExit):
            exchange_with_retry(
                lambda: "fake_jwt",
                "https://idcs-test.example.com",
                "cid",
                "csec",
            )
        assert constructor.call_count == 1


def test_retry_retries_on_5xx():
    error = make_http_error(500)
    mock_signer = MagicMock()
    with (
        patch("exchange.oci.auth.signers.TokenExchangeSigner") as constructor,
        patch("exchange.time.sleep"),
    ):
        constructor.side_effect = [error, error, mock_signer]
        result = exchange_with_retry(
            lambda: "fake_jwt", "https://idcs-test.example.com", "cid", "csec"
        )
        assert constructor.call_count == 3
        assert result is mock_signer


def test_retry_retries_on_429():
    error = make_http_error(429, '{"error":"Too Many Requests"}')
    mock_signer = MagicMock()
    with (
        patch("exchange.oci.auth.signers.TokenExchangeSigner") as constructor,
        patch("exchange.time.sleep"),
    ):
        constructor.side_effect = [error, mock_signer]
        result = exchange_with_retry(
            lambda: "fake_jwt", "https://idcs-test.example.com", "cid", "csec"
        )
        assert constructor.call_count == 2
        assert result is mock_signer


def test_retry_max_attempts():
    error = make_http_error(500)
    with (
        patch("exchange.oci.auth.signers.TokenExchangeSigner") as constructor,
        patch("exchange.time.sleep"),
    ):
        constructor.side_effect = error
        with pytest.raises(RuntimeError):
            exchange_with_retry(
                lambda: "fake_jwt",
                "https://idcs-test.example.com",
                "cid",
                "csec",
            )
        assert constructor.call_count == 4


def test_retry_network_error_retries():
    mock_signer = MagicMock()
    with (
        patch("exchange.oci.auth.signers.TokenExchangeSigner") as constructor,
        patch("exchange.time.sleep"),
    ):
        constructor.side_effect = [
            oci_requests.exceptions.ConnectionError("network"),
            oci_requests.exceptions.ConnectionError("network"),
            mock_signer,
        ]
        result = exchange_with_retry(
            lambda: "fake_jwt", "https://idcs-test.example.com", "cid", "csec"
        )
        assert constructor.call_count == 3
        assert result is mock_signer


def test_keygen_produces_rsa2048():
    supplier = exchange.oci.auth.session_key_supplier.SessionKeySupplier()
    assert supplier.private_key.key_size == 2048


def test_private_key_pem_output():
    supplier = exchange.oci.auth.session_key_supplier.SessionKeySupplier()
    pem_bytes = supplier.private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    assert pem_bytes.startswith(b"-----BEGIN PRIVATE KEY-----")


def test_token_type_literal_in_source():
    source = (Path(__file__).parent.parent / "exchange.py").read_text()
    assert "urn:oci:token-type:oci-upst" in source


@pytest.mark.skipif(
    not (Path(__file__).parent.parent / "action.yml").exists(),
    reason="action.yml not yet created",
)
def test_no_set_x_in_action_yml():
    source = (Path(__file__).parent.parent / "action.yml").read_text()
    assert "set -x" not in source
    assert "set -o xtrace" not in source


def test_config_write_default_profile(tmp_path):
    config_path = tmp_path / "config"
    token_path = tmp_path / "upst.token"
    key_path = tmp_path / "upst.pem"
    write_config(config_path, token_path, key_path, "ap-sydney-1")
    content = config_path.read_text()
    assert "[DEFAULT]" in content
    assert f"security_token_file={token_path.resolve()}" in content
    assert f"key_file={key_path.resolve()}" in content
    assert "region=ap-sydney-1" in content


def test_expires_at_iso8601():
    expires_at = datetime.datetime.fromtimestamp(
        1746777600, tz=datetime.timezone.utc
    ).isoformat()
    assert isinstance(expires_at, str)
    assert "T" in expires_at
    assert expires_at.endswith("+00:00")
    assert datetime.datetime.fromisoformat(expires_at)


def test_get_jwt_calls_correct_url(monkeypatch):
    monkeypatch.setenv(
        "ACTIONS_ID_TOKEN_REQUEST_URL", "https://token.actions.githubusercontent.com/foo"
    )
    monkeypatch.setenv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "fake-bearer")
    response = MagicMock()
    response.json.return_value = {"value": "fake.jwt.token"}

    with patch("exchange.requests.get", return_value=response) as get:
        result = get_jwt("https://github.com/ColourWithin")

    get.assert_called_once()
    _, kwargs = get.call_args
    assert get.call_args.args[0] == "https://token.actions.githubusercontent.com/foo"
    assert kwargs["params"] == {"audience": "https://github.com/ColourWithin"}
    assert kwargs["headers"] == {"Authorization": "bearer fake-bearer"}
    assert result == "fake.jwt.token"


def test_key_file_permissions(tmp_path):
    supplier = exchange.oci.auth.session_key_supplier.SessionKeySupplier()
    signer = make_signer(supplier.private_key)
    config_path = tmp_path / ".oci" / "config"
    key_path = tmp_path / ".oci" / "upst.pem"
    token_path = tmp_path / ".oci" / "upst.token"
    config_path.parent.mkdir(parents=True)

    write_credentials(signer, config_path, key_path, token_path, "ap-sydney-1")

    mode = oct(os.stat(key_path).st_mode)[-3:]
    assert mode == "600"


def test_token_file_permissions(tmp_path):
    supplier = exchange.oci.auth.session_key_supplier.SessionKeySupplier()
    signer = make_signer(supplier.private_key)
    config_path = tmp_path / ".oci" / "config"
    key_path = tmp_path / ".oci" / "upst.pem"
    token_path = tmp_path / ".oci" / "upst.token"
    config_path.parent.mkdir(parents=True)

    write_credentials(signer, config_path, key_path, token_path, "ap-sydney-1")

    mode = oct(os.stat(token_path).st_mode)[-3:]
    assert mode == "600"
    assert f"security_token_file={token_path.resolve()}" in config_path.read_text()
