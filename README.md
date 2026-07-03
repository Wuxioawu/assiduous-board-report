# Assiduous Board Report Platform

为 Assiduous 打造的可扩展 AI-native 财务看板平台：将上传的财报文件转化为结构化数据、可视化指标与 AI 生成的洞察，服务于管理层（Management）、董事会（Board）、股权投资人（Equity）与信贷方（Credit）四类不同视角的报告需求。

本次以 **Senus PLC** 作为首个接入案例。

架构与领域模型详见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)；仓库约定与开发命令详见 [`CLAUDE.md`](./CLAUDE.md)。

## 当前阶段（Phase 1）

跑通多租户 + 认证 + 后端骨架 + 可视化前端骨架：

- 多租户数据模型（8 张核心表，行级 `organization_id` 隔离）
- 注册 / 登录，JWT 认证
- FastAPI 后端骨架 + Alembic 迁移
- React + TypeScript + Vite 前端骨架，登录后展示公司列表，图表组件（假数据）验证可视化链路

文件上传处理、LLM 抽取、真实指标计算、AI insight 生成留待下一阶段。

## 快速开始

```bash
# 1. 起数据库
docker compose up -d db

# 2. 后端
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env   # 按需修改
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 3. 前端（新终端）
cd frontend
npm install
npm run dev
```

前端默认运行在 http://localhost:5173 ，后端 API 在 http://localhost:8000/api/v1 。
