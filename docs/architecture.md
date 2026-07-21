# 系统架构说明

## 项目架构

本项目采用微信小程序 + Node.js 服务端 + MySQL 数据库架构。

结构：

用户端小程序
↓
services/api-client.js
↓
Node.js 服务端
↓
MySQL 数据库

## 前端层

负责：
- 页面展示
- 用户交互
- 状态管理
- 接口调用

主要目录：
- pages
- modules
- components
- services

## 服务端层

负责：
- 用户认证
- 业务处理
- 数据访问
- 权限控制

主要目录：
- server

## 数据层

负责：
- 用户数据
- 业务数据
- 订单数据
- 财务数据

主要目录：
- database
