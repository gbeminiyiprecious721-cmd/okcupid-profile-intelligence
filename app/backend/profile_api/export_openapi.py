"""Write the OpenAPI document, so the frontend types can be generated from it."""

import json
import sys

from profile_api.config import Settings
from profile_api.main import create_app

if __name__ == "__main__":
    target = sys.argv[1]
    with open(target, "w") as handle:
        json.dump(
            create_app(Settings(_env_file=None, app_mode="local", rate_limit_enabled=False)).openapi(), handle, indent=2
        )
        handle.write("\n")
