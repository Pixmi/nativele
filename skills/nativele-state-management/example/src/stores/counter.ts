import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";

const counter = createSlice({
  name: "counter",
  initialState: { value: 0 },
  reducers: {
    increment: (state) => {
      state.value += 1;
    },
  },
});

const filter = createSlice({
  name: "filter",
  initialState: "all" as "all" | "done",
  reducers: { setFilter: (_state, action: PayloadAction<"all" | "done">) => action.payload },
});

export const store = configureStore({ reducer: { counter: counter.reducer, filter: filter.reducer } });
export const { increment } = counter.actions;
export const { setFilter } = filter.actions;
export type RootState = ReturnType<typeof store.getState>;
