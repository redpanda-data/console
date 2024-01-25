import { PaginationState, Updater } from "@redpanda-data/ui";

export const onPaginationChange = (state: PaginationState, callBack?: (args: { pageSize: number; pageIndex: number }) => void) => (x: Updater<PaginationState>) => {
    const newState = typeof x === 'function' ? x(state) : x
    callBack?.(newState)
}
