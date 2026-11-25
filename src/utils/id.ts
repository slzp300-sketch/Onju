/** DB(uuid PK)와 호환되는 클라이언트 생성 ID */
export const newId = () => crypto.randomUUID();
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
