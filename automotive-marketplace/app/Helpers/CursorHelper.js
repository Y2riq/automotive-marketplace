class CursorHelper {
    static encode(param1, param2) {
        let payload;
        if (typeof param1 === 'object' && param1 !== null && !(param1 instanceof Date)) {
            payload = param1;
        } else {
            payload = { sortVal: param1, id: param2, createdAt: param1 };
        }
        return Buffer.from(JSON.stringify(payload)).toString('base64');
    }

    static decode(cursor) {
        try {
            const decoded = Buffer.from(cursor, 'base64').toString('utf8');
            const parsed = JSON.parse(decoded);
            if (parsed.sortVal === undefined && parsed.createdAt !== undefined) {
                parsed.sortVal = parsed.createdAt;
            }
            return parsed;
        } catch (e) {
            throw new Error('Invalid pagination cursor');
        }
    }
}

module.exports = CursorHelper;