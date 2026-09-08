begin;
select plan(8);
select has_column('catcht', 'saved_searches', 'body_style', 'searches can explicitly require a sedan');
select col_type_is('catcht', 'saved_searches', 'body_style', 'text', 'body restriction uses a bounded text contract');
select ok(not has_table_privilege('anon', 'catcht.saved_searches', 'SELECT'), 'body-style searches remain private');
select ok(not has_table_privilege('authenticated', 'catcht.saved_searches', 'SELECT'), 'browser identities cannot read searches');
select lives_ok($$update catcht.saved_searches set body_style='sedan',
  desired_features=array['apple_carplay','android_auto','ventilated_front_seats','massaging_front_seats','warmth_comfort','amg_line','burmester_3d','magic_body_control'],
  required_features=array['surround_view'] where id=(select id from catcht.saved_searches limit 1)$$,
  'new comfort intent and existing required features persist together');
select throws_ok($$update catcht.saved_searches set body_style='anything'$$, '23514', null, 'unsupported body styles fail closed');
select throws_ok($$update catcht.saved_searches set desired_features=array['invented_feature']$$, '23514', null, 'unknown desired features are rejected');
select throws_ok($$update catcht.saved_searches set required_features=array['invented_feature']$$, '23514', null, 'unknown required features are rejected');
select * from finish();
rollback;
