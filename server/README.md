# API 服务

小程序不应直连 MySQL。本目录提供 HTTP API，由服务端读取数据库环境变量并连接远程 MySQL；小程序只保存短期会话令牌。

## 本地启动

```bash
cd server
npm install
DB_HOST=... DB_PORT=3311 DB_NAME=... DB_USER=... DB_PASSWORD=... npm start
```

## 手机号归属地数据

导入前先在 PowerShell 中设置数据库密码，然后在 `server` 目录执行：

```powershell
$env:DB_PASSWORD = '云数据库密码'
npm run import:phone -- "D:\Project\phone\phone_location\mysql\phone_location.sql"
```

导入器会过滤非标准 7 位手机号段，先写入临时表并校验数量与唯一性，校验通过后再改名为 `phone_location`。不会删除项目现有业务表。

归属地接口使用纯数字环境变量 `LOCAL_AREA_CODE` 判断本地号码，`start-local.ps1` 默认为成都行政区划代码 `510100`。中文展示名称由 Node.js UTF-8 源码提供，避免 Windows PowerShell 5 的脚本编码导致乱码。

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
