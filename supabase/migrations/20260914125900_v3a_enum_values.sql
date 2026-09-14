-- v3a: enum values and extensions that must be committed before the v3 functions that use them
alter type ticket_state add value if not exists 'resale';
alter type ticket_state add value if not exists 'sold_back';
create extension if not exists pg_net;
