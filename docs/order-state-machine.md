# 订单状态机

## 2026-07-22 客服审核主状态

```text
PENDING → CONTACTING → VERIFYING
  ├─ VERIFIED → CONFIRMED
  └─ INVALID_INFO → CORRECTING → VERIFIED → CONFIRMED

CONFIRMED → DISPATCHING → ASSIGNED → PROCESSING → COMPLETED
VERIFIED / INVALID_INFO → CANCELLED（客户无办理意愿）
```

预审、撤回、办理失败、待核销及核销退回状态继续作为兼容和异常流程状态保留。

## 2026-07-22 业务员任务状态

申请/订单状态继续保存在 `applications.status`；派单后的细粒度办理过程保存在 `application_tasks.status`，避免联系和预约过程影响客服审核状态。

```text
上门：PENDING_ACCEPT → WAITING_CONTACT → WAITING_TIME_CONFIRMATION
  → WAITING_HOME_SERVICE → WAITING_START_CONFIRMATION → PROCESSING
  → WAITING_RESULT_UPLOAD → PENDING_VERIFICATION → COMPLETED

到店：PENDING_ACCEPT → WAITING_CONTACT → WAITING_TIME_CONFIRMATION
  → WAITING_CUSTOMER_ARRIVAL → WAITING_START_CONFIRMATION → PROCESSING
  → WAITING_RESULT_UPLOAD → PENDING_VERIFICATION → COMPLETED
```

`WAITING_CONTACT → CONTACT_FAILED → CONTACTED` 支持重复联系。无法开始或继续办理时进入 `ABNORMAL_CLOSED`。客服核销退回时任务从 `PENDING_VERIFICATION` 回到 `WAITING_RESULT_UPLOAD`。

## 2026-07-20 办理流程补全

人工审核通过后的流程统一为：

```text
PENDING_CONTACT
  → CONTACT_FAILED → PENDING_CONTACT（重新联系）
  → CLIENT_DECLINED（客户放弃，终态）
  → PENDING_SERVICE_MODE
      → HOME_SERVICE
          → PENDING_APPOINTMENT
          → PENDING_DISPATCH
          → PENDING_SERVICE
          → IN_SERVICE
      → STORE_SERVICE
          → PENDING_STORE_SERVICE
          → IN_STORE_SERVICE
```

上门办理和营业厅办理共用后续结果：

```text
办理失败 → SERVICE_FAILED
办理成功 → PENDING_VERIFICATION
  → VERIFICATION_RETURNED → 补充凭证后重新进入 PENDING_VERIFICATION
  → SERVICE_COMPLETED
```

`PRE_SCREEN_REJECTED`、`REVIEW_REJECTED`、`CLIENT_DECLINED`、`SERVICE_FAILED`、`WITHDRAWN`、`SERVICE_COMPLETED` 和 `CLOSED` 不阻止客户创建新申请；只有仍可继续处理的申请状态会阻止重复提交。

## 1. 目的与原则

本文定义订单的业务流转和纸面账单记录的边界。订单状态描述客户办理进度；纸面账单与返现完成入账为独立账务记录，不代表小程序发起资金支付。

- 状态只能由拥有相应权限的角色变更，并记录操作者、时间、原因和备注。
- 用户、商家、业务员、客服、财务、BOSS 只能查看其授权范围内的状态。
- 返现与佣金金额仅为记账数据；系统不调用支付、转账、打款或退款能力。

## 2. 订单主流程

```text
用户提交需求
  → 提交申请
  → 自动预审
  → 客服审核
  → 审核通过
  → 营业厅/客服联系用户
  → 确认上门时间并派单
  → 上门办理
  → 业务员提交凭证
  → 客服核销通过
  → 服务完成 / 订单结束
```

## 3. 订单状态定义

| 状态码 | 状态名称 | 含义 | 可操作角色 |
| --- | --- | --- | --- |
| `DEMAND_SUBMITTED` | 已提交需求 | 用户完成入口信息或表达办理意愿，尚未形成完整申请。 | 用户 |
| `APPLICATION_SUBMITTED` | 已提交申请 | 用户已填写申请和预审所需信息，等待自动预审。 | 用户 |
| `PRE_SCREEN_REJECTED` | 预审不通过 | 自动预审未满足规则，订单不进入客服审核池。 | 系统 |
| `PENDING_REVIEW` | 待客服审核 | 自动预审通过，等待客服人工审核。 | 系统、客服 |
| `REVIEW_REJECTED` | 审核不通过 | 客服审核拒绝，必须记录拒绝原因。 | 客服 |
| `PENDING_CONTACT` | 待联系用户 | 客服审核通过，等待营业厅或客服联系用户。 | 客服 |
| `PENDING_APPOINTMENT` | 待确认上门 | 正在与用户确认上门时间。 | 客服、用户 |
| `PENDING_DISPATCH` | 待派单 | 上门时间已确认，等待客服指定业务员。 | 客服 |
| `PENDING_SERVICE` | 待上门办理 | 已派单，等待按预约时间上门办理。 | 客服、业务员 |
| `IN_SERVICE` | 办理中 | 业务员开始上门办理。 | 业务员 |
| `PENDING_VERIFICATION` | 待客服核销 | 业务员已完成实名核实并提交办理凭证。 | 业务员、客服 |
| `VERIFICATION_RETURNED` | 核销退回 | 客服核销未通过，等待业务员补充或修正凭证。 | 客服、业务员 |
| `SERVICE_COMPLETED` | 服务完成 | 客服核销通过；此时认定为有效成单。 | 客服 |
| `WITHDRAWN` | 已撤回 | 用户在上门服务开始前主动撤回申请；原申请资料只读保留，可重新提交新申请。 | 用户 |
| `CLOSED` | 已结束 | 订单业务流程结束。是否与 `SERVICE_COMPLETED` 合并由实现阶段统一处理。 | 系统、客服 |

`PENDING_DISPATCH` 的派单时点按当前理解设置在上门时间确认后；如业务需要先派单再约时间，应在实现前调整该顺序。

## 4. 合法主路径

```text
DEMAND_SUBMITTED
  → APPLICATION_SUBMITTED
  → PENDING_REVIEW
  → PENDING_CONTACT
  → PENDING_APPOINTMENT
  → PENDING_DISPATCH
  → PENDING_SERVICE
  → IN_SERVICE
  → PENDING_VERIFICATION
  → SERVICE_COMPLETED
  → CLOSED
```

自动预审在 `APPLICATION_SUBMITTED` 后执行：通过则进入 `PENDING_REVIEW`，不通过则进入 `PRE_SCREEN_REJECTED`。客服审核不通过则进入 `REVIEW_REJECTED`。客服核销退回则进入 `VERIFICATION_RETURNED`，业务员补充凭证后回到 `PENDING_VERIFICATION`。

## 5. 纸面账单与入账确认

纸面账单不改变订单是否完成办理。它关联已完成订单，单独保存返现和佣金记账信息。

| 账单状态码 | 状态名称 | 含义 | 可操作角色 |
| --- | --- | --- | --- |
| `NOT_RECORDED` | 未登记 | 订单尚未登记纸面账单。 | 财务 |
| `RECORDED` | 已登记 | 已记录账单编号、金额、日期、门店、订单、经办人、附件和备注。 | 财务 |
| `PENDING_CONFIRMATION` | 待入账确认 | 纸面账单已登记，等待财务确认。 | 财务 |
| `REFUND_POSTED` | 返现完成入账 | 财务确认订单返现已入账；仅为账务确认。 | 财务 |
| `CORRECTED` | 已更正 | 原纸面账单已按规则更正并保留关联记录。 | 财务 |
| `VOIDED` | 已作废 | 纸面账单已作废并保留作废原因。 | 财务 |

客服核销通过后，系统可创建待登记账单；财务确认 `REFUND_POSTED` 后，用户和商家仅查看相应状态和授权金额，不获得资金操作能力。

## 6. 待确认分支

- 取消、改约、爽约、业务员拒单、改派、超时、派单失败和账单异常的状态与恢复路径。
- 月话费五档的互斥区间和返现档位映射。
- 纸面账单录入、复核、归档、作废和更正的人员分离规则。
