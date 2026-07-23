# 数据库关系说明

## 核心实体

用户(User)
↓
申请(Application)
↓
业务员任务(ApplicationTask)
↓
派单、联系、预约、任务状态日志、办理结果
↓
财务记录(Finance)

## 业务员任务关系

- `applications`：申请和订单主状态。
- `application_tasks`：每个已派单申请唯一的办理任务。
- `application_dispatches`：保留派单历史，不承担任务当前状态。
- `application_contact_records`：客服及业务员联系记录；业务员记录关联 `task_id`。
- `application_task_status_history`：任务每次状态变化、操作人和原因。
- `application_appointments`：上门或预计到店时间记录。
- `fulfillment_submissions`：办理结果和客服核销记录，关联 `task_id`。

## 角色关系

客户：提交申请、查看订单

商家：推广客户、查看业务

业务员：处理任务

客服：审核申请

财务：处理账单

管理员：维护系统

## 修改数据库要求

- 不直接删除历史业务数据
- 保持字段兼容
- 修改前确认关联表
