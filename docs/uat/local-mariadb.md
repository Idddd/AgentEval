# 本地 MariaDB 测试环境

用途：验证 Marketplace MariaDB 存储改造。独立测试实例，不连接 NeMo/F5 的数据库。

## 配置

| 项目 | 值 |
|---|---|
| Compose project | `agenteval-uat-db` |
| 初始测试版本 | MariaDB `11.4.13`，Compose 已固定镜像 digest；正式 UAT 版本确定后用相同版本重复验证 |
| 地址 | `127.0.0.1:13306` |
| 数据库 | `marketplace_uat_test` |
| 应用用户 | `marketplace_test` |
| 数据卷 | `agenteval-uat-db_mariadb-test-data` |
| 配置文件 | `deploy/compose.mariadb-test.yml` |
| 本机随机口令 | `.artifacts/uat-mariadb/.env`，已被 Git 忽略，不提交或打包 |

以下命令从此工作目录根执行：

```powershell
docker compose --env-file .artifacts/uat-mariadb/.env -p agenteval-uat-db -f deploy/compose.mariadb-test.yml up -d --wait
docker compose --env-file .artifacts/uat-mariadb/.env -p agenteval-uat-db -f deploy/compose.mariadb-test.yml ps
```

停止并保留数据：

```powershell
docker compose --env-file .artifacts/uat-mariadb/.env -p agenteval-uat-db -f deploy/compose.mariadb-test.yml stop
```

不要在正常停止/升级时附加删除数据卷的选项。口令只在空数据卷初始化时设置；更改 env 文件不会自动轮换现有数据库用户口令。

测试容器通过回环地址映射端口。主机应用使用上述 host/port；容器内客户端使用其容器网络地址，不能使用本机回环地址代替。

Compose 配置检查不会打印口令：

```powershell
docker compose --env-file .artifacts/uat-mariadb/.env -p agenteval-uat-db -f deploy/compose.mariadb-test.yml config --quiet
```

验收需包括：容器 healthy、应用账号连接、建表/读写、事务回滚、容器重启后数据保留。数据库可用不表示 Marketplace 已完成 MariaDB 接入。

## 2026-10-21 验证记录

- Compose 配置校验通过，容器状态 healthy。
- 数据库实际版本 `11.4.13-MariaDB-ubu2404`；应用身份 `marketplace_test@%`。
- 应用账号建表、写入、读取成功，事务 ROLLBACK 后值保持不变。
- 使用同一数据卷重建容器后，测试记录仍为 `persisted-before-restart`，`persistence_ok=1`。
- 主机 TCP `127.0.0.1:13306` 可连接。验证后已删除本次临时测试表。
- 镜像 digest：`sha256:250e1609e93c0e6aecf64bfbab2d84d5e89d2481540fe77447ff6c855c3b1873`。
- Marketplace 尚未完成 MariaDB 驱动与业务存储改造；以上仅为数据库环境验证。

Docker 启动前曾因残留 `dockerInference` / `engine.sock` 失败。已退出失败进程，备份 `AppData/Local/Docker/run` 与 `AppData/Local/docker-secrets-engine` 中的临时通信目录后恢复；备份名称含 `backup-uat-20261021`。未执行恢复出厂设置，未删除既有镜像、容器或数据卷。
