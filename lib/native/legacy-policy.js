// 旧五件访问策略：生产默认关闭，只有测试/迁移环境显式打开。
//
// 打开方式：`node --env-file=test/legacy-mode.flags ...`；真实 DSH 不设此变量。
export const LEGACY_ALLOWED = process.env.DSH_NOVEL_KIT_ALLOW_LEGACY === '1'

export const LEGACY_BLOCKED = Object.freeze({
  code: 'legacy-migration-required',
  message: '这本书还没有 kit 原生身份：先用“继承导入”或“kit 旧版迁移”，迁完再操作；v2 运行时不再直接读写五件账本。',
})
