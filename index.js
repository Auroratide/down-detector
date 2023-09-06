import * as path from "path"
import * as fs from "fs/promises"

const TEST_URL = "https://api.ipify.org"
const MAX_MS = 3333
const PING_INTERVAL_MS = 5000
const FAILURE_WINDOW = 30
const FAILURE_THRESHOLD = 3

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function msInMin(ms) {
	return Math.round(ms / 1000 / 60 * 100) / 100
}

async function testConnection() {
	const start = new Date()
	const response = await fetch(TEST_URL)
		.then((res) => ({
			start,
			succeeded: res.ok,
			message: res.statusText,
		})).catch((err) => ({
			start,
			succeeded: false,
			message: err.message,
		}))
	const end = new Date()

	response.durationMs = end - start
	if (response.durationMs > MAX_MS) {
		response.succeeded = false
		response.message = `Exceeded response time limit of ${MAX_MS} ms`
	}

	response.toString = () => `${response.succeeded ? "✅" : "❌"} [${response.start.toISOString()}] [${response.durationMs} ms] ${response.message}`
	console.log(response.toString())

	return response
}

function isInternetDown(responses) {
	const failures = responses.filter((response) => !response.succeeded)
	return failures.length >= FAILURE_THRESHOLD
}

function logFileName(time) {
	return path.join("out", `downtime-${time.toISOString().replace(/[\-:\.]/g, "")}.log`)
}

async function recordDowntimeEvent(start, response) {
	const file = logFileName(start)
	const message = response.toString()

	await fs.appendFile(file, message + "\n")
}

async function startDowntimeRecording(start, responses) {
	const file = logFileName(start)
	const message = `🚨 [${start.toISOString()}] Detected downtime! Recording events in ${file}.`
	console.log(message)

	await fs.writeFile(file, `DOWNTIME STARTING AT ${start.toISOString()}\n`)

	for (const response of responses) {
		await recordDowntimeEvent(start, response)
	}

	await fs.appendFile(file, message + "\n")
}

async function endDowntimeRecording(start, end) {
	const file = logFileName(start)
	const message = `🎉 [${end.toISOString()}] Downtime ended! Duration: ${msInMin(end - start)} min`
	console.log(message)

	await fs.appendFile(file, message + "\n")
}

async function main() {
	let currentDowntimeStart = undefined
	let responses = []

	while(true) {
		responses = responses.slice(-FAILURE_WINDOW)

		const response = await testConnection()
		responses.push(response)

		if (isInternetDown(responses) && currentDowntimeStart == null) {
			currentDowntimeStart = new Date()
			await startDowntimeRecording(currentDowntimeStart, responses)
		}

		if (currentDowntimeStart != null) {
			await recordDowntimeEvent(currentDowntimeStart, response)
		}

		if (!isInternetDown(responses) && currentDowntimeStart != null) {
			const end = new Date()
			await endDowntimeRecording(currentDowntimeStart, end)
			currentDowntimeStart = undefined
		}

		await sleep(PING_INTERVAL_MS)
	}
}

main()
