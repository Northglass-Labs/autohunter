begin;

select plan(13);

select has_schema('catcht', 'the application schema exists');

select set_eq(
  $$
    select table_name::text
    from information_schema.tables
    where table_schema = 'catcht'
      and table_type = 'BASE TABLE'
  $$,
  $$
    values
      ('watch_models'),
      ('listings'),
      ('manual_evidence'),
      ('digest_runs'),
      ('digest_items'),
      ('consumed_tokens'),
      ('saved_searches'),
      ('source_runs'),
      ('user_profiles'),
      ('listing_matches'),
      ('user_listing_decisions')
  $$,
  'the privilege contract covers every private application table'
);

select ok(
  not exists (
    select 1
    from pg_namespace as namespace
    cross join lateral aclexplode(
      coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
    ) as acl
    where namespace.nspname = 'catcht'
      and acl.grantee = 0
      and acl.privilege_type = 'USAGE'
  ),
  'PUBLIC has no usage on the private application schema'
);

select ok(
  not exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) as acl
    where namespace.nspname = 'catcht'
      and relation.relkind in ('r', 'p')
      and acl.grantee = 0
  ),
  'PUBLIC has no privileges on private application tables'
);

select ok(
  not has_schema_privilege('anon', 'catcht', 'USAGE'),
  'anon has no usage on the private application schema'
);

select ok(
  not has_schema_privilege('authenticated', 'catcht', 'USAGE'),
  'authenticated has no usage on the private application schema'
);

select ok(
  not has_schema_privilege('service_role', 'catcht', 'USAGE'),
  'service_role has no usage on the private application schema'
);

select ok(
  not exists (
    select 1
    from information_schema.tables as application_table
    cross join (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as privilege(privilege_name)
    where application_table.table_schema = 'catcht'
      and application_table.table_type = 'BASE TABLE'
      and has_table_privilege(
        'anon',
        format('%I.%I', application_table.table_schema, application_table.table_name),
        privilege.privilege_name
      )
  ),
  'anon has no private application table privileges'
);

select ok(
  not exists (
    select 1
    from information_schema.tables as application_table
    cross join (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as privilege(privilege_name)
    where application_table.table_schema = 'catcht'
      and application_table.table_type = 'BASE TABLE'
      and has_table_privilege(
        'authenticated',
        format('%I.%I', application_table.table_schema, application_table.table_name),
        privilege.privilege_name
      )
  ),
  'authenticated has no private application table privileges'
);

select ok(
  not exists (
    select 1
    from information_schema.tables as application_table
    cross join (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as privilege(privilege_name)
    where application_table.table_schema = 'catcht'
      and application_table.table_type = 'BASE TABLE'
      and has_table_privilege(
        'service_role',
        format('%I.%I', application_table.table_schema, application_table.table_name),
        privilege.privilege_name
      )
  ),
  'service_role has no private application table privileges'
);

select ok(
  not exists (
    select 1
    from pg_default_acl as defaults
    join pg_namespace as namespace on namespace.oid = defaults.defaclnamespace
    cross join lateral aclexplode(defaults.defaclacl) as acl
    left join pg_roles as grantee on grantee.oid = acl.grantee
    where namespace.nspname = 'catcht'
      and defaults.defaclobjtype in ('r', 'S')
      and (
        acl.grantee = 0
        or grantee.rolname in ('anon', 'authenticated', 'service_role')
      )
  ),
  'future tables and sequences do not default to browser-facing privileges'
);

select ok(
  case
    when not exists (select 1 from pg_roles where rolname = 'catcht_app') then true
    else (
    has_schema_privilege('catcht_app', 'catcht', 'USAGE')
    and not exists (
      select 1
      from information_schema.tables as application_table
      where application_table.table_schema = 'catcht'
        and application_table.table_type = 'BASE TABLE'
        and (
          not has_table_privilege(
            'catcht_app',
            format('%I.%I', application_table.table_schema, application_table.table_name),
            'SELECT'
          )
          or not has_table_privilege(
            'catcht_app',
            format('%I.%I', application_table.table_schema, application_table.table_name),
            'INSERT'
          )
          or has_table_privilege(
            'catcht_app',
            format('%I.%I', application_table.table_schema, application_table.table_name),
            'DELETE'
          )
          or has_table_privilege(
            'catcht_app',
            format('%I.%I', application_table.table_schema, application_table.table_name),
            'UPDATE'
          ) <> (
            application_table.table_name::text = any(array[
              'watch_models',
              'listings',
              'manual_evidence',
              'digest_runs',
              'saved_searches',
              'user_profiles',
              'listing_matches',
              'user_listing_decisions'
            ])
          )
        )
    )
    )
  end,
  'catcht_app is least-privileged when the separately provisioned login exists'
);

select ok(
  case
    when not exists (select 1 from pg_roles where rolname = 'mookmobile_app') then true
    else (
    has_schema_privilege('mookmobile_app', 'catcht', 'USAGE')
    and not exists (
      select 1
      from information_schema.tables as application_table
      where application_table.table_schema = 'catcht'
        and application_table.table_type = 'BASE TABLE'
        and (
          not has_table_privilege(
            'mookmobile_app',
            format('%I.%I', application_table.table_schema, application_table.table_name),
            'SELECT'
          )
          or not has_table_privilege(
            'mookmobile_app',
            format('%I.%I', application_table.table_schema, application_table.table_name),
            'INSERT'
          )
          or has_table_privilege(
            'mookmobile_app',
            format('%I.%I', application_table.table_schema, application_table.table_name),
            'DELETE'
          )
          or has_table_privilege(
            'mookmobile_app',
            format('%I.%I', application_table.table_schema, application_table.table_name),
            'UPDATE'
          ) <> (
            application_table.table_name::text = any(array[
              'watch_models',
              'listings',
              'manual_evidence',
              'digest_runs',
              'saved_searches',
              'user_profiles',
              'listing_matches',
              'user_listing_decisions'
            ])
          )
        )
    )
    )
  end,
  'the production compatibility login is least-privileged when it exists'
);

select * from finish();
rollback;
