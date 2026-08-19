//#region server/lib/appkit.ts
function toAppKit(app) {
	return app;
}
function rows(result) {
	return result?.data ?? [];
}
function num(value) {
	if (value === null || value === void 0) return NaN;
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : NaN;
}
function str(value) {
	if (value === null || value === void 0) return "";
	if (typeof value === "object") return JSON.stringify(value);
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
	return "";
}

//#endregion
export { num, rows, str, toAppKit };