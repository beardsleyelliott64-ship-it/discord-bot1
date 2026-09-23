using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class BuildScript
{
    public static void BuildAndroid()
    {
        Directory.CreateDirectory("android");

        int build = 1;
        int.TryParse(Environment.GetEnvironmentVariable("BUILD_NUMBER"), out build);
        if (build < 1) build = 1;

        PlayerSettings.bundleVersion = "1.0." + build;
        PlayerSettings.Android.bundleVersionCode = build;
        PlayerSettings.SetScriptingBackend(
            BuildTargetGroup.Android,
            ScriptingImplementation.IL2CPP);
        PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
        PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel29;

        string[] scenes = { "Assets/Scenes/Main.unity" };
        var report = BuildPipeline.BuildPlayer(
            scenes,
            "android/BetterQuest3.apk",
            BuildTarget.Android,
            BuildOptions.None);

        if (report.summary.result != BuildResult.Succeeded)
            throw new Exception("Build failed: " + report.summary.result);

        Debug.Log("Created android/BetterQuest3.apk");
    }
}
