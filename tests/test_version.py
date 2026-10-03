import re

import eczane_etiket


def test_version_is_a_semver_like_string():
    assert re.match(r"^\d+\.\d+\.\d+$", eczane_etiket.__version__)
