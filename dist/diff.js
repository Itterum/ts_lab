"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiff = getDiff;
/**
 * Deeply compares two values and returns a diff object containing only the fields that differ.
 * For arrays of objects, it attempts to match items by a unique key (`id` or `title`).
 */
function getDiff(yc, cu) {
    const diff = {};
    const keys = new Set([...Object.keys(yc), ...Object.keys(cu)]);
    for (const key of keys) {
        const ycVal = yc[key];
        const cuVal = cu[key];
        if (ycVal === undefined || cuVal === undefined) {
            diff[key] = { yc: ycVal, cu: cuVal };
            continue;
        }
        // Handle primitives and simple equality
        if (typeof ycVal !== "object" || ycVal === null ||
            typeof cuVal !== "object" || cuVal === null) {
            if (ycVal !== cuVal)
                diff[key] = { yc: ycVal, cu: cuVal };
            continue;
        }
        // Arrays
        if (Array.isArray(ycVal) && Array.isArray(cuVal)) {
            const arrayDiff = [];
            const maxLen = Math.max(ycVal.length, cuVal.length);
            for (let i = 0; i < maxLen; i++) {
                const ycItem = ycVal[i];
                const cuItem = cuVal[i];
                if (ycItem === undefined || cuItem === undefined) {
                    arrayDiff.push({ yc: ycItem, cu: cuItem });
                    continue;
                }
                // Try to match by id or title
                let matchIdx = -1;
                if (cuItem.id !== undefined) {
                    matchIdx = cuVal.findIndex((it) => it.id === ycItem.id);
                }
                else if (cuItem.title !== undefined) {
                    matchIdx = cuVal.findIndex((it) => it.title === ycItem.title);
                }
                const matchedCu = matchIdx >= 0 ? cuVal[matchIdx] : cuItem;
                const subDiff = getDiff(ycItem, matchedCu);
                if (Object.keys(subDiff).length > 0)
                    arrayDiff.push(subDiff);
            }
            if (arrayDiff.length > 0)
                diff[key] = arrayDiff;
            continue;
        }
        // Nested objects
        const subDiff = getDiff(ycVal, cuVal);
        if (Object.keys(subDiff).length > 0)
            diff[key] = subDiff;
    }
    return diff;
}
