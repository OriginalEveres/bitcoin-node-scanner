export type Ok<T> = {
	ok: true;
	value: T;
};

export type Fail<E = string> = {
	ok: false;
	error: E;
};

export type Result<T, E = string> = Ok<T> | Fail<E>;

export function ok<T>(value: T): Ok<T> {
	return { ok: true, value };
}

export function fail<E = string>(error: E): Fail<E> {
	return { ok: false, error };
}
