"""Standalone seed utility — run `python seed.py` (optional; the UI has a Load-demo button).

Loads the demo corpus + evaluation labels directly. No default admin is EVER created:
start the app and use the first-run setup screen to create the first admin."""

import asyncio

from lib.seed_corpus import load_demo


async def main() -> None:
    result = await load_demo("seed-script")
    print(f"Demo corpus loaded: {result}")
    print("No default credentials are shipped — open the app and create the first admin via the setup screen.")


if __name__ == "__main__":
    asyncio.run(main())
