---
title: Install
group: Get started
order: 1
---

Bear is free, and installing it takes a minute. Grab the right file for your computer from the [Download page](../../../download/), then follow the steps for your system below.

## Windows

There are two installers, and you only need one.

- **Bear-Setup-&lt;version&gt;.exe** installs Bear for your own user account. It does not need administrator rights, so it is the right choice for most people.
- **Bear-&lt;version&gt;.msi** installs Bear for everyone on the computer. It is meant for IT teams who roll software out to many machines.

Bear's installers are not signed with a paid certificate yet, so the first time you run one, Windows SmartScreen may show a blue "Windows protected your PC" box. This is normal for unsigned software. To continue:

1. Click **More info**.
2. Click **Run anyway**.

If you installed Bear before, running a newer installer upgrades it in place and keeps your files.

## macOS

Download the `.dmg` that matches your Mac: `-arm64` for Apple silicon, `-x64` for Intel. Open it and drag Bear into Applications.

Because the build is unsigned, macOS will not open it with a double-click the first time. Instead:

1. Open **Applications** in Finder.
2. Right-click Bear and choose **Open**.
3. Choose **Open** again in the dialog that appears.

You only need to do this once. After that, Bear opens like any other app.

## Linux

**AppImage.** The AppImage runs without installing anything. Make it executable, then start it:

```bash
chmod +x Bear-*.AppImage
./Bear-*.AppImage
```

**.deb.** On Debian, Ubuntu and friends, install the package with your package manager:

```bash
sudo apt install ./bear_*.deb
```

## Android

On Android, Bear comes as an `.apk` file, the standard install file for Android apps. It needs Android 7.0 or later and works on phones and tablets.

This is a test build. It is signed with a debug key and is not on Google Play, so Android treats it as an app from outside the store. To install it:

1. Download the `.apk` on your device, or copy it over from a computer.
2. Open the downloaded file.
3. When Android asks, allow installs from this source (your browser or file manager). You can switch this off again afterwards.
4. If Play Protect offers to scan the app, let it, then choose **Install**.

If you have Android's developer tools on a computer, you can install it over USB instead:

```bash
adb install Bear-0.1.1-debug.apk
```

Use the file name you downloaded in place of `Bear-0.1.1-debug.apk`.

A later release may be signed with a different key. Android will not install it over this test build, so you may need to uninstall the old one first.

## Open your files with Bear

On computers, the installers register Bear for `.docx`, `.xlsx` and `.pptx` files. Double-click one and Bear opens it in the right app. If Bear is already running, the file opens in a new Bear window.

Ready to try it? Head to [your first document](../first-document/).
