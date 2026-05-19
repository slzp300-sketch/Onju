import { setupWorker } from 'msw/browser';
import { routineHandlers } from './handlers/routines';
import { goalHandlers } from './handlers/goals';
import { groupHandlers } from './handlers/groups';
import { reviewHandlers } from './handlers/reviews';

export const worker = setupWorker(
  ...routineHandlers,
  ...goalHandlers,
  ...groupHandlers,
  ...reviewHandlers,
);
