export type NetAddr = {
	ip: string;
	port: number;
};

export type Node = NetAddr & {
	label?: string;
};
