# 客服模块知识库

## 模块定位
负责客户申请审核、业务流程推进、预约确认和业务员派单。

## 目录
modules/customer-service

## 页面
- pages/home/index
- pages/review/index
- pages/dispatch/index
- pages/verification/index
- pages/all-data/index

## 业务流程
客户提交申请
→ 客服审核
→ 审核通过
→ 确认预约
→ 指派业务员

客服工作台展示待审核、待派遣、已派遣、待核销、核销完成和全部数据；“全部数据”支持按上述阶段筛选。结果核销页区分待核销与已完成核销记录。

## 2026-07-22 审核员流程

客服审核主流程调整为：

```text
PENDING → CONTACTING → VERIFYING
  → VERIFIED → 确认办理意愿 → CONFIRMED
  → DISPATCHING → ASSIGNED → PROCESSING → COMPLETED
```

信息异常时进入 `INVALID_INFO`。客户无办理意愿进入 `CANCELLED`；仍愿意办理则进入 `CORRECTING`，保存更正信息后重新确认办理方式。办理方式使用 `HOME_SERVICE`（上门）或 `STORE_SERVICE`（线下网点）。

信息修正沿用客户申请问卷的选项结构，并自动回填原始答案。客服可调整号码类型、本地卡意愿、套餐档位和三项履约承诺，再填写可选的修正备注。提交后结构化答案同步回写申请字段，同时在 `corrected_info` 中保留本次更正快照和备注。

客服查询接口只读取数据，不得在 GET 请求中推进申请状态。每次状态变化写入 `application_status_history`。

联系客户未成功时，申请保持 `CONTACTING`，并以 `contact_result=UNREACHABLE` 标记为待重新联系；失败原因和每次联系结果写入 `application_contact_records`。审核列表支持按待审核、联系中、待重联、核实中、待确认/修正分类筛选。

## 开发注意
- 保持审核状态流转一致
- 修改前检查订单和申请数据关联
