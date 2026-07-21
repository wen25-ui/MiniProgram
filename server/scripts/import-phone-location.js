const fs = require('fs')
const path = require('path')
const db = require('../src/db')

const source = path.resolve(process.argv[2] || '')
if (!source || !fs.existsSync(source)) {
  console.error('Usage: node scripts/import-phone-location.js <phone_location.sql>')
  process.exit(1)
}

const rowPattern = /^INSERT INTO `phone_location` VALUES \((\d+), ('[^']*'|NULL), '([^']*)', ('[^']*'|NULL), ('[^']*'|NULL), ('[^']*'|NULL), (\d+), ('[^']*'|NULL), '([^']*)', ('[^']*'|NULL), '([^']*)'\);$/
const unquote = value => value === 'NULL' ? null : value.slice(1, -1).replace(/''/g, "'")
const stagingTable = `phone_location_import_${Date.now()}`

async function flush(rows) {
  if (!rows.length) return
  const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',')
  await db.query(`INSERT IGNORE INTO \`${stagingTable}\` (id,pref,phone,province,city,isp,isp_type,post_code,city_code,area_code,create_time) VALUES ${placeholders}`, rows.flat())
  rows.length = 0
}

async function run() {
  await db.query(`CREATE TABLE \`${stagingTable}\` (
    id INT NOT NULL AUTO_INCREMENT,
    pref VARCHAR(10) NULL,
    phone VARCHAR(20) NOT NULL,
    province VARCHAR(45) NULL,
    city VARCHAR(45) NULL,
    isp VARCHAR(45) NULL,
    isp_type SMALLINT NOT NULL DEFAULT 0,
    post_code VARCHAR(100) NULL,
    city_code VARCHAR(10) NOT NULL,
    area_code VARCHAR(100) NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_phone_location_phone (phone), KEY idx_phone_location_city_code (city_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  const lines = fs.readFileSync(source, 'utf8').split(/\r?\n/)
  const rows = []
  let imported = 0
  for (const line of lines) {
    const match = line.match(rowPattern)
    if (!match || !/^1\d{6}$/.test(match[3])) continue
    rows.push([Number(match[1]), unquote(match[2]), match[3], unquote(match[4]), unquote(match[5]), unquote(match[6]), Number(match[7]), unquote(match[8]), match[9], unquote(match[10]), match[11]])
    imported++
    if (rows.length >= 1000) {
      await flush(rows)
      if (imported % 50000 === 0) console.log(`Imported ${imported} rows...`)
    }
  }
  await flush(rows)
  const [[check]] = await db.query(`SELECT COUNT(*) count, COUNT(DISTINCT phone) unique_count FROM \`${stagingTable}\``)
  if (Number(check.count) !== imported || Number(check.unique_count) !== imported) throw new Error(`Import verification failed: ${JSON.stringify(check)}`)
  const [[exists]] = await db.query("SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='phone_location'")
  if (Number(exists.count)) throw new Error('phone_location already exists; refusing to replace it automatically')
  await db.query(`RENAME TABLE \`${stagingTable}\` TO phone_location`)
  console.log(`Phone location import complete: ${imported} rows.`)
}

run().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => db.end())
