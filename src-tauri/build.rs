use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    tauri_build::build();

    #[cfg(target_os = "macos")]
    build_apple_intelligence_bridge();
}

#[cfg(target_os = "macos")]
fn build_apple_intelligence_bridge() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let swift_src = manifest_dir.join("swift-bridge/AppleIntelligenceBridge.swift");
    println!("cargo:rerun-if-changed={}", swift_src.display());

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let lib_path = out_dir.join("libAppleIntelligenceBridge.a");

    let sdk = Command::new("xcrun")
        .args(["--sdk", "macosx", "--show-sdk-path"])
        .output()
        .expect("xcrun --sdk macosx --show-sdk-path");
    assert!(
        sdk.status.success(),
        "failed to resolve macOS SDK path via xcrun"
    );
    let sdk_path = String::from_utf8_lossy(&sdk.stdout).trim().to_string();

    // Target the host triple so the archive links cleanly into the Tauri binary.
    let target = env::var("TARGET").unwrap_or_else(|_| "aarch64-apple-darwin".into());
    let arch = if target.starts_with("x86_64") {
        "x86_64"
    } else {
        "arm64"
    };

    let status = Command::new("xcrun")
        .args([
            "swiftc",
            "-parse-as-library",
            "-emit-library",
            "-static",
            "-O",
            "-module-name",
            "AppleIntelligenceBridge",
            "-sdk",
            &sdk_path,
            "-target",
            &format!("{arch}-apple-macos26.0"),
            "-framework",
            "FoundationModels",
            "-framework",
            "Foundation",
            "-o",
            lib_path.to_str().unwrap(),
            swift_src.to_str().unwrap(),
        ])
        .status()
        .expect("failed to invoke swiftc for AppleIntelligenceBridge");

    assert!(
        status.success(),
        "swiftc failed building AppleIntelligenceBridge (need Xcode 26+ with FoundationModels)"
    );

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=AppleIntelligenceBridge");
    println!("cargo:rustc-link-lib=framework=FoundationModels");
    println!("cargo:rustc-link-lib=framework=Foundation");
    println!("cargo:rustc-link-lib=framework=CoreFoundation");
    println!("cargo:rustc-link-lib=framework=Security");

    // Static Swift archives pull in swiftCore / swift_Concurrency via autolink,
    // but rustc does not add the OS / Xcode Swift runtime search paths or rpaths.
    // Without these, dyld fails at launch with:
    //   Library not loaded: @rpath/libswift_Concurrency.dylib
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");

    if let Ok(output) = Command::new("xcode-select").arg("-p").output() {
        if output.status.success() {
            let xcode = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let swift_macosx = format!(
                "{xcode}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx"
            );
            let swift55_macosx = format!(
                "{xcode}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-5.5/macosx"
            );
            println!("cargo:rustc-link-arg=-Wl,-rpath,{swift_macosx}");
            println!("cargo:rustc-link-arg=-Wl,-rpath,{swift55_macosx}");
            println!("cargo:rustc-link-search=native={swift_macosx}");
            println!("cargo:rustc-link-search=native={swift55_macosx}");
        }
    }

    println!("cargo:rustc-link-search=native={sdk_path}/usr/lib/swift");
    // Prefer absolute install names under /usr/lib/swift when the linker can
    // resolve them (matches pure-Swift binaries). Keep explicit link of the
    // concurrency runtime so the load command is present and rpath-backed.
    println!("cargo:rustc-link-lib=swiftCore");
    println!("cargo:rustc-link-lib=swift_Concurrency");
}
