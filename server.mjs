import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const distPath = path.join(__dirname, 'dist')

app.use(express.static(distPath, { maxAge: '1y', index: false }))

app.use((_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

const port = Number(process.env.PORT || 8080)
app.listen(port, () => {
  console.log(`Server started on ${port}`)
})
