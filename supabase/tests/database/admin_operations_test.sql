begin;
select plan(6);

select ok(
  not has_function_privilege('anon', 'public.admin_create_restaurant(uuid,uuid,text,text,text,integer)', 'execute'),
  'anonymous role cannot call restaurant creation RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_create_restaurant(uuid,uuid,text,text,text,integer)', 'execute'),
  'authenticated users cannot call restaurant creation RPC directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_assign_owner(uuid,uuid,uuid)', 'execute'),
  'authenticated users cannot assign owner access directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_update_restaurant(uuid,uuid,text,text,integer,boolean)', 'execute'),
  'authenticated users cannot modify restaurant operations directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_record_recovery_event(uuid,uuid,uuid)', 'execute'),
  'authenticated users cannot insert recovery audit events directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.admin_audit_events', 'select'),
  'administrative audit records are not readable by restaurant users'
);

select * from finish();
rollback;
