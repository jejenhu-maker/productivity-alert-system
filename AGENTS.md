# AGENTS.md — 人時生產力預警系統

## 資料治理（開發前必讀）

治理文件位於 `governance/` 子目錄（git submodule）。
來源 repo：https://github.com/jejenhu-maker/richpharmacy-governance

### 必讀檔案
1. `governance/canonical_model.yaml` — 標準表定義與欄位命名
2. `governance/business_glossary.yaml` — 業務名詞語意定義
3. `governance/alias_registry.yaml` — 新舊系統欄位對照（含禁用名稱）
4. `governance/pos_source_mapping.yaml` — POS 欄位 mapping

### 硬規則
1. 欄位命名必須優先查閱 canonical_model.yaml，已存在的語意**禁止自創同義新名**。
2. 出現 forbidden_aliases（如 shop, store, item, drug, member, employee）= schema violation。
3. 主鍵：UUID `id`；業務碼另設 `_code` + unique index。
4. 外鍵指向技術主鍵（UUID id），不指向業務鍵（code）。
5. 金額：`decimal(12,2)`，單位「元」。
6. 每張表必須有 `created_at` / `updated_at`。
7. 軟刪除用 `is_active` boolean。
8. 需要的實體不在 canonical model 中 → 暫停開發，回報 `[NEW_ENTITY]`。
9. 所有表放 public schema，不做 schema 隔離。

### POS 對接
- POS 是來源系統，不是命名標準。不直接改動 POS 資料庫。
- POS 欄位對照見 `governance/pos_source_mapping.yaml`。
