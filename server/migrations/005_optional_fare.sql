-- Routing availability must never be required to create a ride.
ALTER TABLE rides ALTER COLUMN estimated_total_cost_cents DROP NOT NULL;
