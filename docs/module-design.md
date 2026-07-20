# 系统模块划分设计

## 1. 目标

系统按角色拆分为独立模块，确保某个角色的页面、展示组件和交互调整不会影响其他角色；登录、权限、订单状态、纸面账单规则等跨角色能力保持唯一实现，避免复制代码和规则漂移。

本设计基于 [系统需求说明](requirements.md)。待确认的权限和结算规则不在当前阶段固化为业务实现。

## 2. 划分原则

- **按角色隔离页面**：每类用户的页面、局部组件和页面编排只放在自己的模块中。
- **按业务域共享规则**：订单、预审、派单、履约、纸面账单与入账确认、身份和权限等规则不属于任何单一角色模块，统一放入共享业务层。
- **按微信小程序子包加载角色模块**：入口与认证使用主包；各角色使用独立子包，便于维护、按需加载和后续独立测试。
- **禁止跨角色直接引用页面**：角色间只通过统一服务、事件或路由参数协作，不相互调用对方页面内部方法。
- **先迁移后扩展**：保留当前原型功能；先把既有页面按归属迁移，再新增注册、登录、客服、财务和 BOSS 能力。

## 3. 推荐目录

```text
miniprogram/
├── app.js                         # 应用生命周期；只初始化全局运行环境
├── app.json                       # 主包路由、子包声明和全局组件
├── core/                          # 所有模块共用的基础能力
│   ├── auth/                      # 会话、登录态、角色与权限守卫
│   ├── router/                    # 入口解析、登录后跳转、角色路由白名单
│   ├── request/                   # API 请求、错误转换、鉴权头
│   └── storage/                   # 本地缓存封装；未来可替换为服务端会话
├── domain/                        # 不依赖页面的业务规则和数据模型
│   ├── identity/                  # 用户、员工、BOSS、角色、手机号登录及号码归属地
│   ├── attribution/               # 商家二维码、分享链接、来源归因
│   ├── screening/                 # 用户预审及规则版本
│   ├── order/                     # 订单状态机、时间线、查询条件
│   ├── dispatch/                  # 审核、派单、预约及异常处理
│   ├── fulfillment/               # 上门办理、凭证和核销
│   └── settlement/                # 纸面账单、返现/佣金记账、入账确认与更正
├── services/                      # 与后端/云函数交互的实现
│   ├── auth-service.js
│   ├── phone-service.js           # 手机号登录与号码归属地查询
│   ├── order-service.js
│   ├── settlement-service.js       # 账单记录服务，不调用支付或转账
│   └── upload-service.js
├── shared/                        # 不携带角色权限的复用 UI 与工具
│   ├── components/
│   ├── constants/
│   ├── utils/
│   └── styles/
├── pages/                         # 主包：仅入口、注册、登录和通用错误页
│   ├── entry/                     # 解析二维码/分享参数并保存来源
│   ├── auth/                      # 用户注册、手机号验证、微信授权
│   └── error/
└── modules/                       # 独立角色子包
    ├── client/                    # 用户端
    ├── merchant/                  # 商家端
    ├── salesman/                  # 业务员端
    ├── customer-service/          # 客服端
    ├── finance/                   # 财务端
    ├── boss/                      # BOSS 端
    └── admin/                     # 后台管理员端：商家、业务员、客服账号维护
```

`mock/` 仅在原型期保留，后续移动至 `services/mock/` 或测试目录；不得让角色页面直接读写假数据或本地缓存。

## 4. 角色模块边界

| 模块 | 页面/功能范围 | 依赖的共享业务域 | 不应承担的职责 |
| --- | --- | --- | --- |
| `modules/client` | 手机号登录、首页、号码归属地确认、预审、预审结果、预约、我的订单、订单详情、返现入账查询 | identity、attribution、screening、order、settlement | 审核、派单、最终金额计算 |
| `modules/merchant` | 商家首页、专属二维码、归属客户、订单进度、佣金与对账 | identity、attribution、order、settlement | 查看非本店客户、修改归因、审核客户 |
| `modules/salesman` | 待办任务、任务详情、接单、上门、凭证提交、异常上报 | identity、order、dispatch、fulfillment | 访问未派给本人的订单、核定最终结算 |
| `modules/customer-service` | 客服工作台、人工审核、联络用户确认上门、派单、凭证核销、客户查询、服务记录 | identity、order、dispatch、fulfillment | 财务账单确认、越权访问无关订单；咨询/工单等辅助功能待确认 |
| `modules/finance` | 纸面账单、返现完成入账确认、佣金记账、对账与更正记录 | order、settlement | 修改审核、派单、履约结果；不得发起支付、转账或打款 |
| `modules/boss` | 经营看板、数据汇总、人员与权限管理入口 | identity、order、settlement | 绕过审计直接改写订单或金额 |
| `modules/admin` | 商家、业务员和客服账号的新增、修改、停用及基础信息维护 | identity、auth、audit | 访问业务订单、管理用户/财务/BOSS/其他管理员 |

## 5. 入口与路由流程

```text
二维码 / 分享链接
      ↓
pages/entry                 # 校验、解析并暂存来源归因
      ↓
pages/auth                  # 未注册用户完成手机号登录；微信授权待后续确认
      ↓
core/auth                   # 建立登录态、读取已分配角色
      ↓
modules/client              # 普通用户首次登录默认进入用户端

员工 / BOSS 登录入口
      ↓
pages/auth → core/auth → 经角色守卫进入已授权模块
```

用户端外的角色登录与开户尚未确认，因此仅建立通用角色守卫和预留入口，不在当前阶段假设具体注册流程。二维码和分享入口只能路由至用户注册/用户端。

## 6. `app.json` 子包建议

后续将角色模块声明为子包，主包保持轻量。示意如下：

```json
{
  "pages": [
    "pages/entry/index",
    "pages/auth/register/index",
    "pages/auth/login/index"
  ],
  "subpackages": [
    { "root": "modules/client", "pages": ["home/index", "screen/index", "orders/index", "profile/index"] },
    { "root": "modules/merchant", "pages": ["home/index", "customers/index", "commission/index"] },
    { "root": "modules/salesman", "pages": ["tasks/index", "task-detail/index"] },
    { "root": "modules/customer-service", "pages": ["home/index"] },
    { "root": "modules/finance", "pages": ["home/index", "refunds/index", "commissions/index"] },
    { "root": "modules/boss", "pages": ["dashboard/index", "progress/index"] }
  ]
}
```

此为目标结构，不应在权限归属未确认时直接移动现有管理员页面。

## 7. 当前代码的迁移映射

| 当前位置 | 目标位置 | 处理方式 |
| --- | --- | --- |
| `pages/identity` | `pages/auth` 与 `core/auth` | 现有演示角色选择页改为真实登录后路由；不得保留任意角色直达能力 |
| `pages/client/*` | `modules/client/*` | 保留现有用户流程，补充入口归因、注册和预约边界 |
| `pages/merchant/*` | `modules/merchant/*` | 保留客户、订单和佣金页面，新增二维码管理 |
| `pages/salesman/*` | `modules/salesman/*` | 保留任务与凭证流程，补充权限和异常处理 |
| `pages/admin/dashboard`、`progress` | `modules/boss/*` | 仅迁移经营汇总能力 |
| `pages/admin/refunds`、`commissions` | `modules/finance/*` | 仅迁移纸面账单、入账确认和对账能力 |
| `pages/admin/review`、`dispatch`、`verify` | `modules/customer-service/*` | 客服负责审核、派单和核销；迁移时补充客服权限守卫与操作审计 |
| 旧本地订单 API 与缓存数据层 | `domain/*` 与 `services/*` | 已移除；页面统一通过服务层访问服务端，不能直接调用本地存储 |
| `components`、`constants`、`utils` | `shared/*` | 仅保留无角色业务权限的通用代码 |

## 8. 关键共享模块责任

| 共享模块 | 唯一职责 | 被禁止的实现 |
| --- | --- | --- |
| `core/auth` | 登录态、角色集合、授权校验、退出登录 | 在任意页面内硬编码角色或绕过权限 |
| `domain/order` | 订单状态机、合法迁移、时间线 | 在用户端、商家端或业务员端各写一套状态判断 |
| `domain/settlement` | 返现/佣金记账规则、纸面账单、入账确认和更正 | 在页面中计算最终金额，或调用支付、转账能力 |
| `domain/attribution` | 二维码/分享链接来源校验和归因 | 前端信任可篡改的来源参数 |
| `services/*` | API、上传和缓存适配 | 页面直接操作 `wx` 缓存或 mock 数据 |
| `shared/components` | 无角色敏感数据的通用展示 | 将角色权限判断封装进通用组件 |

## 9. 实施顺序

1. 保留当前原型功能，建立 `core`、`domain`、`services`、`shared` 和 `modules` 目录骨架。
2. 完成入口解析、注册登录、会话与角色守卫；用户扫码/分享后默认进入用户端。
3. 迁移客户、商家和业务员的既有页面，移除页面对 mock/本地缓存的直接依赖。
4. 将审核、派单、核销页面迁移至客服模块，并拆分财务与 BOSS 页面。
5. 接入后端接口、服务端权限和状态机；最后替换原型数据层。

## 10. 开始框架搭建前的阻塞决策

- 商家、业务员、客服、财务的账号开户和登录方式。
- 多角色账号、角色切换和数据范围。
- 客服、财务、BOSS 的具体权限。
- 六类淘汰、返现、佣金、纸面账单及入账确认/更正规则。
