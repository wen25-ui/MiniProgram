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
  phoneDb: {
    host: process.env.PHONE_DB_HOST || '',
    port: Number(process.env.PHONE_DB_PORT || 4000),
    database: process.env.PHONE_DB_NAME || '',
    user: process.env.PHONE_DB_USER || '',
    password: process.env.PHONE_DB_PASSWORD || '',
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
  },
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  localProvince: '四川',
  localCity: '成都',
  localAreaCode: process.env.LOCAL_AREA_CODE || '510100'
}
