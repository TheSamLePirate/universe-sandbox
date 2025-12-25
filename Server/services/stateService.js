// Store arbitrary values by name (reactive-style shared state)
const sharedValues = new Map(); // key: dataName (string) -> value: string | number

export const isValidName = (name) =>
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 128 &&
    /^[A-Za-z0-9_.-]+$/.test(name);

export const normalizeValue = (v) => {
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "boolean") return v == true ? 1 : 0;
    if (typeof v === "object") return JSON.stringify(v);
    return null;
};

export const getAll = () => {
    return Object.fromEntries(sharedValues);
};

export const has = (name) => sharedValues.has(name);

export const get = (name) => sharedValues.get(name);

export const set = (name, value) => {
    sharedValues.set(name, value);
    return value;
};

export const remove = (name) => {
    const val = sharedValues.get(name);
    sharedValues.delete(name);
    return val;
};
