using UnityEditor;
using UnityEngine;
using UnityEditor.SceneManagement;
using System.IO;

public static class GenerateScene
{
    [MenuItem("Better Quest/Create Playable Main Scene")]
    public static void Create()
    {
        var scene = EditorSceneManager.NewScene(
            NewSceneSetup.DefaultGameObjects,
            NewSceneMode.Single);

        var bootstrap = new GameObject("Game Bootstrap");
        bootstrap.AddComponent<BetterQuest3.GameBootstrap>();
        bootstrap.AddComponent<BetterQuest3.QuestPerformance>();

        var player = new GameObject("Player");
        player.transform.position = new Vector3(0, 1.2f, -4);
        player.AddComponent<BetterQuest3.XRReadyPlayer>();

        Directory.CreateDirectory("Assets/Scenes");
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Main.unity");
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();

        Debug.Log("Generated Assets/Scenes/Main.unity. Configure OpenXR/Meta XR and add your XR Origin/Building Blocks.");
    }
}
