"""Validate reference SQL in a new private temporary PostgreSQL cluster."""
from pathlib import Path
from datetime import datetime, timezone
import json
import os
import shutil
import socket
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / 'docs/_qa'
BIN = Path(r'D:\Database\PostgreSQL\app\bin')
QA.mkdir(parents=True,exist_ok=True)
cluster = Path(tempfile.mkdtemp(prefix='hucescholar_pg_',dir=QA)).resolve()
assert cluster.parent == QA.resolve() and cluster.name.startswith('hucescholar_pg_')
with socket.socket() as s:
    s.bind(('127.0.0.1',0)); port=s.getsockname()[1]
env=os.environ.copy(); env['PGCLIENTENCODING']='UTF8'
flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
started=False
start_requested=False


def run(args):
    print('Checking:',Path(args[0]).name,flush=True)
    # pg_ctl's server child can inherit pipe handles on Windows. A regular file
    # lets us wait for the launcher without waiting for the server's pipe EOF.
    with tempfile.TemporaryFile(dir=QA) as output:
        result=subprocess.run([str(x) for x in args],cwd=ROOT,env=env,stdin=subprocess.DEVNULL,
                              stdout=output,stderr=subprocess.STDOUT,creationflags=flags,timeout=60)
        output.seek(0); stdout=output.read().decode('utf-8',errors='replace')
    if result.returncode:
        raise RuntimeError(stdout)
    return stdout


psql=[BIN/'psql.exe','-X','-q','-t','-A','-h','127.0.0.1','-p',port,'-U','huce_design','-v','ON_ERROR_STOP=1']
report={'environment':'Isolated temporary cluster; no existing server or database modified',
        'timestamp_utc':datetime.now(timezone.utc).isoformat(),'fixture_persistence':'ROLLBACK; not persistent seed data'}
try:
    report['server_binary']=run([BIN/'postgres.exe','--version']).strip()
    run([BIN/'initdb.exe','-D',cluster,'-U','huce_design','-A','trust','--encoding=UTF8','--no-locale','--no-sync'])
    # Trust is limited to this short-lived localhost-only test server.
    start_requested=True
    run([BIN/'pg_ctl.exe','-D',cluster,'-l',QA/'data_design_pg.log','-o',f'-h 127.0.0.1 -p {port}','-w','-t','30','start'])
    started=True
    run([*psql,'-d','postgres','-c','CREATE DATABASE hucescholar_design'])
    args=[*psql,'-d','hucescholar_design']
    run([*args,'-f',ROOT/'docs/database/HUCEScholar_schema_postgresql.sql'])
    report['schema_application']='passed in fresh test database'
    stdout=run([*args,'-f',ROOT/'docs/tools/validate_data_design.sql'])
    result=json.loads(next(line for line in stdout.splitlines() if line.startswith('{')))
    report.update(result)
    report['persisted_fixture_users']=int(run([*args,'-c','SELECT count(*) FROM hucescholar.users']).strip())
    assert report['persisted_fixture_users']==0
    report['foreign_keys']=int(run([*args,'-c',"SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='hucescholar' AND c.contype='f'"]).strip())
    report['status']='passed'
except Exception as error:
    report['status']='failed'; report['error']=str(error)
    raise
finally:
    if start_requested and (cluster/'postmaster.pid').exists():
        try:
            run([BIN/'pg_ctl.exe','-D',cluster,'-m','fast','-w','-t','30','stop'])
            report['test_server']='stopped'
        except Exception as stop_error:
            report['test_server']='Stop could not be confirmed; cluster files preserved'
            report['stop_error']=str(stop_error)
    elif start_requested:
        report['test_server']='stopped'
    (QA/'data_design_validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # Remove only the exact disposable directory created above, after the server stopped.
    if (not start_requested or report.get('test_server')=='stopped') and cluster.parent==QA.resolve() and not cluster.is_symlink():
        shutil.rmtree(cluster)
print(json.dumps(report,ensure_ascii=False,indent=2))
