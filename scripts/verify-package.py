"""Check the actual Monitor installer layout, limits and gzip trailer."""
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile

archive = Path('theme.tar.gz').read_bytes()
assert len(archive) <= 32 * 1024 * 1024, '压缩包超过 32 MiB'
plain = gzip.decompress(archive)  # Reads and validates the CRC/trailer too.
with tarfile.open(fileobj=io.BytesIO(plain), mode='r:') as bundle:
    entries = bundle.getmembers()
    assert len(entries) <= 2000, '包内文件过多'
    assert sum(entry.size for entry in entries) <= 64 * 1024 * 1024, '解压后超过 64 MiB'
    names = {entry.name.removeprefix('./') for entry in entries}
    assert 'theme.json' in names and 'dist/index.html' in names, 'theme.json / dist 必须位于包根目录'
    for entry in entries:
        path = PurePosixPath(entry.name)
        assert not path.is_absolute() and '..' not in path.parts, '不安全的路径'
        assert path.parts[0] in ('theme.json', 'dist', 'LICENSE', 'THIRD_PARTY_LICENSES.md', 'preview.png'), '包里混入非安装文件'
        assert entry.isfile() or entry.isdir(), '包内不能有符号链接等特殊文件'
        assert entry.size <= 8 * 1024 * 1024, f'文件超过 8 MiB: {entry.name}'
        assert not any(part in ('node_modules', 'scripts', 'src', '.git') for part in path.parts), '包里混入开发文件'
        assert not any(part.startswith('.') for part in path.parts if part != '.'), '包里混入隐藏配置文件'
        assert path.suffix.lower() not in ('.map', '.log', '.pem', '.key', '.p12', '.pfx'), '包里混入调试文件或密钥'
        if entry.isfile() and path.suffix in ('.html', '.js', '.css', '.json', '.svg'):
            content = bundle.extractfile(entry).read()
            assert b'/Users/' not in content and b'/home/' not in content, '包内包含本地用户路径'
            assert b'__official-preview.js' not in content and b'HISTORY_DAYS' not in content, '正式包不能包含开发预览脚本'
    manifest = json.load(bundle.extractfile('theme.json'))
    assert all(isinstance(manifest.get(key), str) for key in ('name', 'short', 'description', 'version', 'author', 'url')), 'manifest 必填字段错误'
    assert manifest['name'] and manifest['short'], '名称和 short 不能为空'
    index = bundle.extractfile('dist/index.html').read().decode()
    assert '/__official-preview.js' not in index, '正式包不能包含预览数据脚本'
    assert 'href="/favicon.svg"' in index and 'href="/apple-touch-icon.png"' in index, '图标路径必须遵循 Monitor 约定'
checksum = Path('theme.tar.gz.sha256')
if checksum.exists():
    assert checksum.read_text().split()[0] == hashlib.sha256(archive).hexdigest(), 'SHA256 不一致'
print(f'主题包检查通过：{manifest["short"]} v{manifest["version"]}，{len(entries)} 个条目，gzip / 路径 / 文件上限 / manifest 均有效')
