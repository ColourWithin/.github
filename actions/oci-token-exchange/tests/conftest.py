"""Shared pytest fixtures for oci-token-exchange unit tests."""

import pytest


@pytest.fixture
def github_output(tmp_path, monkeypatch):
    """Temporary $GITHUB_OUTPUT file with automatic environment cleanup."""
    path = tmp_path / "github_output"
    path.write_text("", encoding="utf-8")
    monkeypatch.setenv("GITHUB_OUTPUT", str(path))
    return path


@pytest.fixture
def github_env(tmp_path, monkeypatch):
    """Temporary $GITHUB_ENV file with automatic environment cleanup."""
    path = tmp_path / "github_env"
    path.write_text("", encoding="utf-8")
    monkeypatch.setenv("GITHUB_ENV", str(path))
    return path


@pytest.fixture
def fake_inputs(monkeypatch):
    """Set all INPUT_* and OIDC environment variables to safe test values."""
    monkeypatch.setenv("INPUT_CLIENT_IDENTIFIER", "test-client-id")
    monkeypatch.setenv("INPUT_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv(
        "INPUT_DOMAIN_BASE_URL", "https://idcs-test.identity.oraclecloud.com"
    )
    monkeypatch.setenv("INPUT_AUDIENCE", "https://github.com/ColourWithin")
    monkeypatch.setenv("INPUT_REGION", "ap-sydney-1")
    monkeypatch.setenv(
        "ACTIONS_ID_TOKEN_REQUEST_URL",
        "https://token.actions.githubusercontent.com/test",
    )
    monkeypatch.setenv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "fake-request-token")
