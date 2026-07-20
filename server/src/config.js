function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`缺少服务端环境变量 ${name}`)
  return value
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  host: process.env.API_HOST || '0.0.0.0',
  db: {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD')
  },
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  localProvince: process.env.LOCAL_PROVINCE || '广东',
  localCity: process.env.LOCAL_CITY || '深圳'
}
