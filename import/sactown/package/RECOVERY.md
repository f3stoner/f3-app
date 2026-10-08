# SacTown 2026 YTD post-commit recovery

There is deliberately no generic automated rollback script for this one-time import.

## Before execution

1. Take a database backup or record a point-in-time recovery marker immediately before running `apply.sql`.
2. Save the exact package files and successful psql output.
3. Do not allow SacTown application activity during execution and validation.

## Failure before commit

`apply.sql` is one PostgreSQL transaction with `ON_ERROR_STOP`. Any assertion, constraint, trigger, foreign-key, or SQL error before `commit` aborts the transaction. PostgreSQL rollback is the recovery mechanism; no cleanup script is needed.

## A bad import discovered after commit

Preferred recovery is database PITR/backup restore when operationally acceptable. Otherwise prepare and separately review a cleanup transaction from the inserted-ID ledger for project `6a9fade6-aeda-5fcf-a383-30278385f3b6`. That review must first check for profile claims, later sessions, cross-region participation, member merges, inviter relationships, or any other post-import dependency. Never delete extension-created members mechanically after SacTown begins application activity.
