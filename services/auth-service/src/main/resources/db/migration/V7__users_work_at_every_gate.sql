-- Every cashier may work at every gate: a till is fixed to its gate, a person
-- is not. Who worked where is known from their sign-ins and sales.
DELETE FROM user_gate;
