# 部署說明 - 瑞昌藥局門市人時生產力預警系統

## 🚀 Zeabur 部署步驟

### 1. 創建 GitHub Repository

1. 前往 https://github.com/new
2. Repository name: `productivity-alert-system`
3. Description: `瑞昌藥局門市人時生產力預警與人力成本加權分析工具 (Tier 1項目)`
4. 設置為 Public
5. 點擊 "Create repository"

### 2. 推送代碼到 GitHub

```bash
# 在本地項目目錄執行
git remote add origin https://github.com/jejenhu-maker/productivity-alert-system.git
git branch -M main
git push -u origin main
```

### 3. Zeabur 部署配置

1. 登入 Zeabur Dashboard: https://dash.zeabur.com
2. 創建新項目: "瑞昌藥局人時生產力預警"
3. 連接 GitHub Repository: `jejenhu-maker/productivity-alert-system`

### 4. 環境變數設置

在 Zeabur 中設置以下環境變數：

```env
NODE_ENV=production
BASE_PATH=/productivity
PORT=3000
```

### 5. 域名設置

1. 在 Zeabur 項目中點擊 "Domain"
2. 添加自定義域名: `ai.richpharmacy.com`
3. 設置路徑: `/productivity`
4. 等待 DNS 生效

### 6. 訪問路徑

部署完成後，系統將可通過以下路徑訪問：

- **主儀表板**: https://ai.richpharmacy.com/productivity
- **工時輸入**: https://ai.richpharmacy.com/productivity/input.html
- **員工管理**: https://ai.richpharmacy.com/productivity/employees.html
- **門市管理**: https://ai.richpharmacy.com/productivity/stores.html
- **分析報表**: https://ai.richpharmacy.com/productivity/reports.html

### 7. API 端點

- **健康檢查**: https://ai.richpharmacy.com/productivity/api/health
- **門市API**: https://ai.richpharmacy.com/productivity/api/stores
- **員工API**: https://ai.richpharmacy.com/productivity/api/employees
- **儀表板API**: https://ai.richpharmacy.com/productivity/api/dashboard

## 🔧 技術配置

### 資料庫

系統使用 SQLite 資料庫，包含：
- 8家門市基礎數據
- 32位員工完整檔案
- 權重計算邏輯
- 預警門檻設置

### 自動初始化

首次部署時，系統會自動：
1. 初始化 SQLite 資料庫
2. 載入門市和員工數據
3. 設置預警門檻
4. 啟動健康監控

## ✅ 部署驗證

部署完成後，請驗證以下功能：

1. **健康檢查**: GET `/productivity/api/health` 返回 200
2. **靜態資源**: 前端頁面正常載入
3. **API功能**: 門市和員工數據正常顯示
4. **權重計算**: 加權工時計算正確
5. **預警系統**: 紅黃綠燈狀態正常

## 🏆 項目資訊

- **提案人**: 陳依萍（總部-人資部）
- **項目等級**: Tier 1 - 速贏立項
- **開發完成**: 2026-03-23
- **部署平台**: Zeabur
- **域名**: ai.richpharmacy.com/productivity