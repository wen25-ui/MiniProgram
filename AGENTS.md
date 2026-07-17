# MiniProgram Project Agent Rules

## Project
微信小程序项目

## Working Directory
D:\Project\MiniProgram

## Rules

1. 修改代码前先分析项目结构
2. 不删除已有功能
3. 优先小范围修改
4. 修改后执行测试
5. 提交Git前生成变更说明

## Code Style

保持当前项目代码风格。

## Agent Roles

Developer:
负责代码实现

Reviewer:
负责代码检查

Tester:
负责测试验证

# Agent Workflow


所有任务遵循：

需求
 ↓
PM Agent分析
 ↓
Developer Agent开发
 ↓
Tester Agent验证
 ↓
Reviewer Agent审核
 ↓
Git提交


禁止：

- 未分析直接修改
- 删除未知代码
- 修改配置不说明原因
