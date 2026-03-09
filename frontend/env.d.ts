declare var process: {
  env: {
    NEXT_PUBLIC_API_BASE_URL?: string;
    NEXT_PUBLIC_ADMIN_TOKEN?: string;
    [key: string]: string | undefined;
  };
};

declare module 'react' {
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  export function useState<T>(initial: T): [T, (value: T | ((prev: T) => T)) => void];
}
