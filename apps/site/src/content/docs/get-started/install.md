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
chmod +x Bear-*-x86_64.AppImage
./Bear-*-x86_64.AppImage
```

**.deb.** On Debian, Ubuntu and friends, install the package with your package manager:

```bash
sudo apt install ./bear_*_amd64.deb
```

## Open your files with Bear

The installers register Bear for `.docx`, `.xlsx` and `.pptx` files. Double-click one and Bear opens it in the right app. If Bear is already running, the file opens in a new Bear window.

Ready to try it? Head to [your first document](../first-document/).
