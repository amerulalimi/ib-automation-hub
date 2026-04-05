import pytest
from fastapi import HTTPException

from rbac import ROLE_VIEWER, auth_role, assert_not_viewer, is_privileged


def test_is_privileged():
    assert is_privileged("admin") is True
    assert is_privileged("super_admin") is True
    assert is_privileged("viewer") is False


def test_auth_role_defaults():
    assert auth_role({"role": "viewer"}) == "viewer"
    assert auth_role({}) == "admin"


def test_assert_not_viewer_raises():
    with pytest.raises(HTTPException) as e:
        assert_not_viewer(ROLE_VIEWER)
    assert e.value.status_code == 403
