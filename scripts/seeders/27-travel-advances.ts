import type { SeederModule } from './types';
import { log } from './types';

const MODULE = 'travel-advances';

export const seeder: SeederModule = {
  name: 'Travel Advances',
  order: 27,
  seed: async (_ctx) => {
    // No dedicated TravelAdvance model exists in the schema.
    // Travel advances would be handled via LoanRecord with loanType or
    // via the expense/ESS request system. Skipping to avoid creating
    // records in the wrong model.
    log(MODULE, 'Travel Advances model not found — skipping');
  },
};
