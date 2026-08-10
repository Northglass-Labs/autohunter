begin;

select plan(10);

select has_column('catcht', 'listings', 'offer_role', 'lease intelligence distinguishes live offers from benchmarks and signals');
select has_column('catcht', 'listings', 'source_method', 'source provenance records how an item was obtained');
select has_column('catcht', 'listings', 'due_at_signing_includes_first_payment', 'DAS first-payment semantics are explicit');
select has_column('catcht', 'listings', 'acquisition_fee_included_in_due_at_signing', 'DAS acquisition-fee semantics are explicit');
select has_column('catcht', 'listings', 'security_deposit', 'multiple security deposits are represented');
select has_column('catcht', 'listings', 'security_deposit_refundable', 'deposit refundability is represented');
select col_default_is('catcht', 'listings', 'offer_role', 'active_offer', 'legacy listings remain active offers');
select col_default_is('catcht', 'listings', 'source_method', 'api', 'provider API is the default provenance');
select has_column('catcht', 'digest_runs', 'source_health', 'daily reports preserve source-health evidence');
select col_not_null('catcht', 'digest_runs', 'source_health', 'report source-health snapshots cannot be null');

select * from finish();
rollback;
