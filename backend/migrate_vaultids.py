"""One-time migration: convert albums.vaultIds (array) → albums.vaultId (string).

Usage:
    # Dry run (default) — shows what would change, writes nothing
    python migrate_vaultids.py

    # Apply changes
    python migrate_vaultids.py --apply

Requires Application Default Credentials for the target GCP project.
"""

import argparse
import sys

from app.dependencies import get_firestore_client


def migrate(apply: bool):
    db = get_firestore_client()
    albums = db.collection("albums").get()

    total = 0
    migrated = 0
    skipped = 0
    already_done = 0

    for doc in albums:
        total += 1
        data = doc.to_dict()
        vault_ids = data.get("vaultIds")
        vault_id = data.get("vaultId")

        # Already migrated
        if vault_id and not vault_ids:
            already_done += 1
            continue

        # Has vaultIds array — take the first element
        if vault_ids and isinstance(vault_ids, list) and len(vault_ids) > 0:
            new_vault_id = vault_ids[0]
            print(f"  {doc.id} ({data.get('slug', '?')}): vaultIds={vault_ids} -> vaultId={new_vault_id}")

            if apply:
                from google.cloud.firestore_v1 import DELETE_FIELD

                doc.reference.update({"vaultId": new_vault_id, "vaultIds": DELETE_FIELD})

            migrated += 1
        else:
            print(f"  {doc.id} ({data.get('slug', '?')}): SKIP — no vaultIds and no vaultId")
            skipped += 1

    print()
    print(f"Total albums:    {total}")
    print(f"Migrated:        {migrated}")
    print(f"Already done:    {already_done}")
    print(f"Skipped:         {skipped}")

    if not apply and migrated > 0:
        print("\nThis was a dry run. Re-run with --apply to write changes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate albums vaultIds → vaultId")
    parser.add_argument("--apply", action="store_true", help="Actually write changes to Firestore")
    args = parser.parse_args()

    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: migrating albums vaultIds → vaultId\n")
    migrate(args.apply)
