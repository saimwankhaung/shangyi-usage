using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Globalization;
using System.Web.Script.Serialization;

// A console process proxy for VS Code's documented claudeProcessWrapper setting.
// It forwards all three streams unchanged and persists only rate-limit fields.
public static class ShanGyiClaudeBridge
{
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 65536 };
    static readonly object CaptureLock = new object();
    static readonly HashSet<string> UsageRequests = new HashSet<string>();
    static string SnapshotPath;

    public static int Main(string[] args)
    {
        if (args.Length == 0 || args[0].StartsWith("-")) {
            Console.Error.WriteLine("ShanGyi bridge: the Claude executable path must be the first argument.");
            return 1;
        }
        string dataDir = Environment.GetEnvironmentVariable("SHANGYI_BRIDGE_DATA_DIR");
        if (String.IsNullOrEmpty(dataDir)) dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ShanGyi Usage");
        SnapshotPath = Path.Combine(dataDir, "claude-vscode-snapshot.json");
        StringBuilder arguments = new StringBuilder();
        for (int i = 1; i < args.Length; i++) {
            if (i > 1) arguments.Append(' ');
            arguments.Append(Quote(args[i]));
        }
        Process process = new Process();
        process.StartInfo = new ProcessStartInfo {
            FileName = args[0], Arguments = arguments.ToString(), UseShellExecute = false,
            CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true
        };
        try { process.Start(); }
        catch { Console.Error.WriteLine("ShanGyi bridge: Claude could not start."); return 1; }
        Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) {
            e.Cancel = true;
            try { if (!process.HasExited) process.Kill(); } catch { }
        };
        Thread input = new Thread(delegate() {
            ForwardInput(Console.OpenStandardInput(), process.StandardInput.BaseStream);
            try { process.StandardInput.Close(); } catch { }
        });
        input.IsBackground = true;
        Thread errors = new Thread(delegate() {
            try { process.StandardError.BaseStream.CopyTo(Console.OpenStandardError()); } catch { }
        });
        errors.IsBackground = true;
        Thread output = new Thread(delegate() { ForwardOutput(process.StandardOutput.BaseStream); });
        output.IsBackground = true;
        input.Start(); errors.Start(); output.Start();
        process.WaitForExit();
        output.Join(); errors.Join();
        int code = process.ExitCode;
        process.Dispose();
        return code;
    }

    static string Quote(string value)
    {
        StringBuilder result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { result.Append('\\', slashes * 2 + 1); result.Append('"'); }
            else { result.Append('\\', slashes); result.Append(c); }
            slashes = 0;
        }
        result.Append('\\', slashes * 2);
        result.Append('"');
        return result.ToString();
    }

    static void ForwardOutput(Stream input)
    {
        Stream output = Console.OpenStandardOutput();
        byte[] bytes = new byte[8192];
        char[] chars = new char[8192];
        Decoder decoder = Encoding.UTF8.GetDecoder();
        StringBuilder line = new StringBuilder();
        bool overflow = false;
        try {
            int count;
            while ((count = input.Read(bytes, 0, bytes.Length)) > 0) {
                output.Write(bytes, 0, count); output.Flush();
                int characters = decoder.GetChars(bytes, 0, count, chars, 0);
                for (int i = 0; i < characters; i++) {
                    if (chars[i] == '\n') {
                        if (!overflow) CaptureOutput(line.ToString());
                        line.Length = 0; overflow = false;
                    } else if (!overflow) {
                        if (line.Length >= 65536) { line.Length = 0; overflow = true; }
                        else line.Append(chars[i]);
                    }
                }
            }
        } catch { }
    }

    static void ForwardInput(Stream input, Stream output)
    {
        byte[] bytes = new byte[8192];
        char[] chars = new char[8192];
        Decoder decoder = Encoding.UTF8.GetDecoder();
        StringBuilder line = new StringBuilder();
        bool overflow = false;
        try {
            int count;
            while ((count = input.Read(bytes, 0, bytes.Length)) > 0) {
                int characters = decoder.GetChars(bytes, 0, count, chars, 0);
                for (int i = 0; i < characters; i++) {
                    if (chars[i] == '\n') {
                        if (!overflow) CaptureRequest(line.ToString());
                        line.Length = 0; overflow = false;
                    } else if (!overflow) {
                        if (line.Length >= 65536) { line.Length = 0; overflow = true; }
                        else line.Append(chars[i]);
                    }
                }
                // Claude stays running while VS Code waits for each response.
                // CopyTo alone leaves small control requests in the pipe buffer.
                output.Write(bytes, 0, count);
                output.Flush();
            }
        } catch { }
    }

    static void CaptureRequest(string line)
    {
        if (!line.Contains("\"get_usage\"")) return;
        try {
            var message = ParseMessage(line);
            if (Get(message, "type") as string != "control_request") return;
            var request = Get(message, "request") as Dictionary<string, object>;
            if (Get(request, "subtype") as string != "get_usage") return;
            string id = Get(message, "request_id") as string;
            if (String.IsNullOrEmpty(id) || id.Length > 200) return;
            lock (CaptureLock) { if (UsageRequests.Count < 128) UsageRequests.Add(id); }
        } catch { }
    }

    static void CaptureOutput(string line)
    {
        if (!line.Contains("\"rate_limit_event\"") && !line.Contains("\"control_response\"")) return;
        try {
            var message = ParseMessage(line);
            string type = Get(message, "type") as string;
            lock (CaptureLock) {
                if (type == "rate_limit_event") CaptureQuota(Get(message, "rate_limit_info") as Dictionary<string, object>);
                else if (type == "control_response") {
                    var response = Get(message, "response") as Dictionary<string, object>;
                    string id = Get(response, "request_id") as string;
                    if (id == null || !UsageRequests.Remove(id) || Get(response, "subtype") as string != "success") return;
                    var usage = Get(response, "response") as Dictionary<string, object>;
                    CaptureUsage(Get(usage, "rate_limits") as Dictionary<string, object>);
                }
            }
        } catch { }
    }

    static bool Number(object value, out double number)
    {
        number = 0;
        if (!(value is int || value is long || value is double || value is decimal || value is float)) return false;
        number = Convert.ToDouble(value);
        return !Double.IsNaN(number) && !Double.IsInfinity(number);
    }
    static Dictionary<string, object> ParseMessage(string line)
    {
        lock (CaptureLock) { return Json.DeserializeObject(line) as Dictionary<string, object>; }
    }
    static object Get(Dictionary<string, object> value, string key)
    {
        object result;
        return value != null && value.TryGetValue(key, out result) ? result : null;
    }
    static void CaptureQuota(Dictionary<string, object> info)
    {
        try {
            if (info == null) return;
            Dictionary<string, object> windows = Get(info, "unifiedWindows") as Dictionary<string, object>;
            if (windows == null) {
                string kind = Get(info, "rateLimitType") as string;
                double utilization;
                windows = new Dictionary<string, object>();
                if (kind != null && Number(Get(info, "utilization"), out utilization)) windows[kind] = new Dictionary<string, object> {
                    { "utilization", utilization }, { "resetsAt", Get(info, "resetsAt") }
                };
            }
            Dictionary<string, object> rates = new Dictionary<string, object>();
            foreach (KeyValuePair<string, object> item in windows) {
                if (item.Key.Length > 100 || !Regex.IsMatch(item.Key, "^[a-zA-Z0-9_]+$")) continue;
                Dictionary<string, object> row = item.Value as Dictionary<string, object>;
                if (row == null) continue;
                double used;
                if (!Number(Get(row, "used_percentage"), out used)) {
                    if (!Number(Get(row, "utilization"), out used)) continue;
                    used *= 100;
                }
                if (used < 0) continue;
                double reset;
                object rawReset = Get(row, "resetsAt") ?? Get(row, "resets_at");
                rates[item.Key] = new Dictionary<string, object> {
                    { "used_percentage", used }, { "resets_at", Number(rawReset, out reset) ? (object)reset : null }
                };
            }
            SaveRates(rates);
        } catch { /* Capture failures never change Claude's streams or exit status. */ }
    }

    static void CaptureUsage(Dictionary<string, object> windows)
    {
        if (windows == null) return;
        Dictionary<string, object> rates = new Dictionary<string, object>();
        foreach (var item in windows) {
            var row = item.Value as Dictionary<string, object>;
            if (row != null) AddUsageRate(rates, item.Key, row);
            var scoped = item.Value as object[];
            if (scoped != null) for (int i = 0; i < scoped.Length; i++) {
                row = scoped[i] as Dictionary<string, object>;
                if (row != null) AddUsageRate(rates, item.Key + "_" + i, row);
            }
        }
        SaveRates(rates);
    }

    static void AddUsageRate(Dictionary<string, object> rates, string key, Dictionary<string, object> row)
    {
        if (key.Length > 100 || !Regex.IsMatch(key, "^[a-zA-Z0-9_]+$")) return;
        double used;
        if (!Number(Get(row, "utilization"), out used) || used < 0) return;
        object reset = null;
        double seconds;
        object rawReset = Get(row, "resets_at");
        if (Number(rawReset, out seconds)) reset = seconds;
        else {
            DateTimeOffset date;
            if (DateTimeOffset.TryParse(rawReset as string, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out date))
                reset = (date.UtcDateTime - new DateTime(1970, 1, 1)).TotalSeconds;
        }
        rates[key] = new Dictionary<string, object> { { "used_percentage", used }, { "resets_at", reset } };
    }

    static void SaveRates(Dictionary<string, object> rates)
    {
        try {
            Dictionary<string, object> snapshot = new Dictionary<string, object> {
                { "schemaVersion", 1 }, { "source", "vscode" }, { "rateLimits", rates },
                { "observedAt", (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds }
            };
            Directory.CreateDirectory(Path.GetDirectoryName(SnapshotPath));
            string temporary = SnapshotPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            File.WriteAllText(temporary, Json.Serialize(snapshot), new UTF8Encoding(false));
            try {
                if (File.Exists(SnapshotPath)) File.Replace(temporary, SnapshotPath, null);
                else File.Move(temporary, SnapshotPath);
            } catch {
                try { File.Replace(temporary, SnapshotPath, null); } catch { try { File.Delete(temporary); } catch { } }
            }
        } catch { /* Capture failures never change Claude's streams or exit status. */ }
    }
}
