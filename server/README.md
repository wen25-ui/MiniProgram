# API 服务

小程序不应直连 MySQL。本目录提供 HTTP API，由服务端读取数据库环境变量并连接远程 MySQL；小程序只保存短期会话令牌。

## 本地启动

```bash
cd server
npm install
DB_HOST=... DB_PORT=3311 DB_NAME=... DB_USER=... DB_PASSWORD=... npm start
```

Windows 上可直接运行 `./start-local.ps1`。脚本会配置本地环境、执行数据库迁移并启动 API 服务。

PowerShell 启动指令：

```powershell
cd server
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

也可以在项目根目录直接执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\server\start-local.ps1
```

默认监听 `3000` 端口。开发者工具联调地址在 [`config/api.js`](../config/api.js)；真机和生产环境必须部署该服务到 HTTPS 域名，并在微信公众平台配置该域名。

## 当前接口

- `GET /health`
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/applications/pre-screen`
- `GET /v1/applications/me`
- `GET /v1/merchant/invite-qr`
- `GET|POST /v1/admin/accounts?role=merchant|salesman|customer-service`
- `PUT|DELETE /v1/admin/accounts/:role/:id`

短信认证和 API 生产部署仍需后续接入。数据库密码不得写入小程序、仓库或 `project.private.config.json`。
