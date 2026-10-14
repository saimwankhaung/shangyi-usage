"""Create a macOS app ZIP without losing Unix file modes or framework symlinks.

Native macOS builds are ad-hoc signed and verified. Cross-built Windows ZIPs
are unsigned development artifacts; native Mac validation is still required.
"""
import argparse
import copy
import json
import pathlib
import plistlib
import stat
import struct
import subprocess
import sys
import zipfile

def package(runtime, root, arch):
    root = pathlib.Path(root).resolve()
    version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
    dist = root / 'dist'
    dist.mkdir(exist_ok=True)
    archive = dist / f'ShanGyi-Usage-{version}-macOS-{arch}.zip'
    bundle = 'ShanGyi Usage.app'
    prefix = bundle + '/Contents/Resources/app/'
    with zipfile.ZipFile(runtime) as source, zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as target:
        for original in source.infolist():
            name = original.filename
            if name.startswith('Electron.app/'):
                name = bundle + name[len('Electron.app'):]
            elif name not in ['LICENSE', 'LICENSES.chromium.html', 'version']:
                continue
            if name == 'LICENSE': name = 'LICENSE.electron.txt'
            # Rebranding invalidates the runtime's original signatures.
            if '/_CodeSignature/' in name or name.endswith('/Resources/default_app.asar'):
                continue
            data = source.read(original)
            if name.endswith('/Info.plist'):
                info = plistlib.loads(data)
                if name == bundle + '/Contents/Info.plist':
                    info.update(CFBundleName='ShanGyi Usage', CFBundleDisplayName='ShanGyi Usage',
                                CFBundleIdentifier='org.shangyi.usage', CFBundleShortVersionString=version,
                                CFBundleVersion=version, CFBundleIconFile='shangyi.icns', LSUIElement=True)
                else:
                    old = info.get('CFBundleIdentifier', '')
                    info['CFBundleIdentifier'] = old.replace('com.github.Electron', 'org.shangyi.usage')
                    info['CFBundleDisplayName'] = info.get('CFBundleDisplayName', 'Electron Helper').replace('Electron', 'ShanGyi Usage')
                    info['CFBundleName'] = info.get('CFBundleName', 'Electron Helper').replace('Electron', 'ShanGyi Usage')
                data = plistlib.dumps(info)
            entry = copy.copy(original)
            entry.filename = name
            target.writestr(entry, data)
        def add(name, data):
            entry = zipfile.ZipInfo(name)
            entry.create_system = 3
            entry.external_attr = (stat.S_IFREG | 0o644) << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            target.writestr(entry, data)
        for file in sorted((root / 'app').rglob('*')):
            if file.is_file() and file.suffix.lower() != '.log':
                add(prefix + file.relative_to(root).as_posix(), file.read_bytes())
        add(prefix + 'package.json', (root / 'package.json').read_bytes())
        for file in sorted((root / 'node_modules/jsonc-parser').rglob('*')):
            if file.is_file(): add(prefix + file.relative_to(root).as_posix(), file.read_bytes())
        for name in ['README.md', 'README.my.md', 'README.th.md', 'LICENSE', 'ASSETS.md', 'BRAND-ASSETS-LICENSE.md', 'CHANGELOG.md']:
            data = (root / name).read_bytes()
            add(name, data)
            add(bundle + '/Contents/Resources/' + name, data)
        for file in sorted((root / 'docs').rglob('*')):
            if file.is_file() and (root / 'docs' / 'source') not in file.parents:
                name = file.relative_to(root).as_posix()
                add(name, file.read_bytes())
                add(bundle + '/Contents/Resources/' + name, file.read_bytes())
        png = (root / 'app/assets/icon.png').read_bytes()
        icns = b'icns' + struct.pack('>I', 16 + len(png)) + b'ic08' + struct.pack('>I', 8 + len(png)) + png
        add(bundle + '/Contents/Resources/shangyi.icns', icns)
    if sys.platform == 'darwin':
        import tempfile
        with tempfile.TemporaryDirectory(dir=dist, prefix='mac-sign-') as directory:
            subprocess.run(['ditto', '-x', '-k', str(archive), directory], check=True)
            app = pathlib.Path(directory) / bundle
            subprocess.run(['codesign', '--force', '--deep', '--sign', '-', str(app)], check=True)
            subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
            # ditto preserves framework symlinks, executable modes and signatures.
            subprocess.run(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(app), str(archive)], check=True)
    with zipfile.ZipFile(archive) as check:
        assert check.testzip() is None
        names = check.namelist()
        app_info = plistlib.loads(check.read(bundle + '/Contents/Info.plist'))
        assert app_info['CFBundleIdentifier'] == 'org.shangyi.usage'
        assert json.loads(check.read(prefix + 'package.json'))['version'] == version
        assert check.read(prefix + 'app/renderer/i18n.js')
        assert check.read(bundle + '/Contents/Resources/BRAND-ASSETS-LICENSE.md')
        executable = check.getinfo(bundle + '/Contents/MacOS/Electron')
        assert (executable.external_attr >> 16) & 0o111
        links = [n for n in check.infolist() if stat.S_ISLNK(n.external_attr >> 16)]
        assert links, 'Framework symlinks must be preserved'
    print(json.dumps({'archive': str(archive), 'arch': arch, 'integrityVerified': True,
                      'symlinks': len(links), 'nativeAdHocSigned': sys.platform == 'darwin'}))
    return archive

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', required=True)
    parser.add_argument('--arch', required=True, choices=['arm64', 'x64'])
    args = parser.parse_args()
    package(args.runtime, pathlib.Path(__file__).resolve().parent.parent, args.arch)
