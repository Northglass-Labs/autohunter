begin;

select plan(2);

select has_column('catcht', 'listings', 'safety_evidence', 'listings preserve normalized NHTSA safety evidence');
select col_type_is('catcht', 'listings', 'safety_evidence', 'jsonb', 'NHTSA evidence remains bounded structured data');

select * from finish();
rollback;
